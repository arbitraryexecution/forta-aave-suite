const ethers = require('ethers');
const BigNumber = require('bignumber.js');
const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');

// load required shared types
const {
  LendingPoolAddressesProvider: lendingPoolAddressesProvider,
  ProtocolDataProvider: protocolDataProviderAddress,
} = require('../../contract-addresses.json');
const { abi: protocolDataProviderAbi } = require('../../interfaces/AaveProtocolDataProvider.json');
const { abi: priceOracleAbi } = require('../../interfaces/IPriceOracle.json');
const { abi: priceOracleGetterAbi } = require('../../interfaces/IPriceOracleGetter.json');
const { abi: lendingPoolAddressesProviderAbi } = require('../../interfaces/ILendingPoolAddressesProvider.json');
const { compareOracleToFallback, aaveEverestId } = require('../../agent-config.json');

// set up the an ethers provider
// do not use ethers.providers.WebSocketProvider in production (there is no support)
const jsonRpcProvider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());

// NOTE: this value is imported from agent-config.json
// percent error threshold over which we trigger alerts (2% error compared to the price oracle)
//   percent error = (absolute(oracle - fallbackOracle) / oracle) * 100
const AAVE_ORACLE_PERCENT_ERROR_THRESHOLD = compareOracleToFallback.aaveOraclePercentErrorThreshold;

const SECONDS_PER_DAY = 86400;

// helper function to create alerts
function createAlert(reserveToken, tokenPrice, tokenPriceFallback, percentError, tokenAlert) {
  const { numAlertsInLastDay } = tokenAlert;
  return Finding.fromObject({
    name: `Large AAVE Price Oracle / Fallback Oracle Difference for ${reserveToken.symbol}`,
    description:
    `Token: ${reserveToken.symbol}, Price: ${tokenPrice}, Fallback Price: ${tokenPriceFallback}, `
    + `Number of alerts in last 24 hours: ${numAlertsInLastDay.toString()}`,
    alertId: 'AE-AAVE-FALLBACK-ORACLE-DISPARITY',
    severity: FindingSeverity.Medium,
    type: FindingType.Suspicious,
    everestId: aaveEverestId,
    metadata: {
      symbol: reserveToken.symbol,
      tokenAddress: reserveToken.tokenAddress,
      tokenPrice,
      tokenPriceFallback,
      percentError,
      numAlertsInLastDay,
    },
  });
}

async function initializeTokensContractsAlerts() {
  // create instances of ethers contracts to call read-only methods
  const protocolDataProviderContract = new ethers.Contract(
    protocolDataProviderAddress, protocolDataProviderAbi, jsonRpcProvider,
  );
  const lendingPoolAddressProviderContract = new ethers.Contract(
    lendingPoolAddressesProvider, lendingPoolAddressesProviderAbi, jsonRpcProvider,
  );

  // get an array of all of the reserve tokens, in the form of TokenData struct entries
  // ref: https://docs.aave.com/developers/the-core-protocol/protocol-data-provider#getallreservestokens
  const reserveTokens = await protocolDataProviderContract.getAllReservesTokens();

  // get the AAVE price oracle address
  const priceOracleAddress = await lendingPoolAddressProviderContract.getPriceOracle();
  const priceOracleContractInstance = new ethers.Contract(
    priceOracleAddress,
    priceOracleAbi,
    jsonRpcProvider,
  );

  // get the fallback oracle address
  const fallbackOracleAddress = await priceOracleContractInstance.getFallbackOracle();

  // create ethers contract to run read-only methods from the fallback oracle contract
  const fallbackOracleContractInstance = new ethers.Contract(
    fallbackOracleAddress,
    priceOracleGetterAbi,
    jsonRpcProvider,
  );

  // none of the fallback oracles are well maintained, so we expect alerts for every block
  // therefore, we will generate the first alert, then suppress any additional alerts over a 24 hour
  // period, counting the number that would have been generated, then generate another alert when
  // the 24 hour time period has expired
  // create an array of token / oracle / fallback / alerts tuples that we will iterate over
  const tokenContractFallbackAlertTuples = reserveTokens.map((reserveToken) => ({
    reserveToken,
    priceOracleContractInstance,
    fallbackOracleContractInstance,
    tokenAlert: {
      numAlertsInLastDay: 0,
      tStart: 0,
    },
  }));

  return tokenContractFallbackAlertTuples;
}

function provideHandleBlock(tokensContractsFallbackAlertPromise) {
  return async function handleBlock(blockEvent) {
    const findings = [];

    // settle the promise the first time, all subsequent times just get the resolve() value
    const tokensContractsFallbackAlert = await tokensContractsFallbackAlertPromise;

    // override block number so we get data from the block in question
    const override = { blockTag: blockEvent.blockNumber };

    // get the block timestamp
    const blockTimestamp = new BigNumber(blockEvent.block.timestamp);

    // define the promise function to run for each reserve token
    async function checkOracleAndFallback(tokenContractFallbackAlert) {
      const {
        reserveToken,
        priceOracleContractInstance,
        fallbackOracleContractInstance,
        tokenAlert,
      } = tokenContractFallbackAlert;

      // get the asset price from the oracle
      const oraclePriceEthers = await priceOracleContractInstance.getAssetPrice(
        reserveToken.tokenAddress,
        { ...override },
      );
      // convert the ethers BigNumber type to BigNumber.js type
      const oraclePrice = new BigNumber(oraclePriceEthers.toString());

      // get the asset price from the fallback oracle
      const fallbackPriceEthers = await fallbackOracleContractInstance.getAssetPrice(
        reserveToken.tokenAddress,
        { ...override },
      );

      // convert the returned value to a BigNumber type
      const fallbackPrice = new BigNumber(fallbackPriceEthers.toString());

      // calculate the percent error between the price oracle and the fallback oracle
      const delta = oraclePrice.minus(fallbackPrice).absoluteValue();
      const percentError = delta.div(oraclePrice).multipliedBy(100);

      // check if the value exceeds the threshold
      if (percentError.isGreaterThan(AAVE_ORACLE_PERCENT_ERROR_THRESHOLD)) {
        // if less than 24 hours have elapsed, just increment the counter for the number of alerts
        // that would have been generated
        if (blockTimestamp.minus(tokenAlert.tStart) < SECONDS_PER_DAY) {
          tokenAlert.numAlertsInLastDay += 1;
        } else {
          // create the alert
          findings.push(createAlert(
            reserveToken,
            oraclePrice,
            fallbackPrice,
            percentError,
            tokenAlert,
          ));

          // restart the alert counter for this token
          tokenAlert.numAlertsInLastDay = 0;
          tokenAlert.tStart = new BigNumber(blockTimestamp.toString());
        }
      }
    }

    // for each reserve token, get the price source address and timestamp
    // forEach does not work with async and promises
    // attach a .catch() method to each promise to prevent any rejections from causing Promise.all
    // from failing fast
    await Promise.all(tokensContractsFallbackAlert.map(
      (tokenContractFallbackAlert) => checkOracleAndFallback(
        tokenContractFallbackAlert,
      ).catch((error) => console.error(error)),
    ));

    return findings;
  };
}

module.exports = {
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeTokensContractsAlerts()),
  createAlert,
};
