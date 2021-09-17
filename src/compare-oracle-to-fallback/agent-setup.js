const ethers = require('ethers');

const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');

// load required shared types
const {
  LendingPoolAddressesProvider: lendingPoolAddressesProvider,
  ProtocolDataProvider: protocolDataProviderAddress,
} = require('../../contract-addresses.json');
const { abi: protocolDataProviderAbi } = require('../../abi/AaveProtocolDataProvider.json');
const { abi: aaveOracleAbi } = require('../../abi/AaveOracle.json');
const { abi: priceOracleGetterAbi } = require('../../abi/IPriceOracleGetter.json');
const { abi: lendingPoolAddressesProviderAbi } = require('../../abi/ILendingPoolAddressesProvider.json');
const { aaveEverestId } = require('../../agent-config.json');

// set up the an ethers provider
// do not use ethers.providers.WebSocketProvider in production (there is no support)
const jsonRpcProvider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());

function calculatePercentError(first, second) {
  const delta = first.minus(second).absoluteValue();
  return delta.div(first).multipliedBy(100);
}

// helper function to create alerts
function createAlert(reserveToken, tokenPrice, tokenPriceFallback, percentError, tokenAlert) {
  const { numAlertsInLastDay } = tokenAlert;
  return Finding.fromObject({
    name: `Aave Fallback Oracle Price Difference for ${reserveToken.symbol}`,
    description:
      `Token: ${reserveToken.symbol}, Price: ${tokenPrice}, Fallback Price: ${tokenPriceFallback}, `
      + `Number of alerts in last 24 hours: ${numAlertsInLastDay.toString()}`,
    alertId: 'AE-AAVE-FALLBACK-ORACLE-DISPARITY',
    severity: FindingSeverity.High,
    type: FindingType.Degraded,
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
  const aaveOracleAddress = await lendingPoolAddressProviderContract.getPriceOracle();
  const aaveOracleContractInstance = new ethers.Contract(
    aaveOracleAddress,
    aaveOracleAbi,
    jsonRpcProvider,
  );

  // get the fallback oracle address
  const fallbackOracleAddress = await aaveOracleContractInstance.getFallbackOracle();

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
    aaveOracleContractInstance,
    fallbackOracleContractInstance,
    tokenAlert: {
      numAlertsInLastDay: 0,
      tStart: 0,
    },
  }));

  return tokenContractFallbackAlertTuples;
}

module.exports = {
  createAlert,
  calculatePercentError,
  initializeTokensContractsAlerts,
};
