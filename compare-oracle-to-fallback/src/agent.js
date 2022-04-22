const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const BigNumber = require('bignumber.js');

const {
  AAVE_ORACLE_PERCENT_ERROR_THRESHOLD,
  ALERT_MINIMUM_INTERVAL_SECONDS,
  initializeData,
  provideInitialize,
} = require('./agent-setup');

// helper function to create alerts
function createAlert(
  reserveToken, tokenPrice, tokenPriceFallback, percentError, tokenAlert, data,
) {
  const { developerAbbrev, protocolName, protocolAbbrev } = data;
  const { numAlertsInLastDay } = tokenAlert;

  return Finding.fromObject({
    name: `${protocolName} Fallback Oracle Price Difference for ${reserveToken.symbol}`,
    description:
      `Token: ${reserveToken.symbol}, Price: ${tokenPrice}, Fallback Price: ${tokenPriceFallback}, `
      + `Number of alerts in last 24 hours: ${numAlertsInLastDay.toString()}`,
    alertId: `${developerAbbrev}-${protocolAbbrev}-FALLBACK-ORACLE-DISPARITY`,
    severity: FindingSeverity.High,
    type: FindingType.Degraded,
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

function calculatePercentError(first, second) {
  const delta = first.minus(second).absoluteValue();
  return delta.div(first).multipliedBy(100);
}

// define the promise function to run for each reserve token
async function checkOracleAndFallback(tokenContractFallbackAlert, override, blockTimestamp, data) {
  const {
    reserveToken,
    aaveOracleContractInstance,
    fallbackOracleContractInstance,
    tokenAlert,
  } = tokenContractFallbackAlert;

  // get the asset price from the oracle
  const oraclePriceEthers = await aaveOracleContractInstance.getAssetPrice(
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
  const percentError = calculatePercentError(oraclePrice, fallbackPrice);

  // check if the value exceeds the threshold
  if (percentError.isGreaterThan(AAVE_ORACLE_PERCENT_ERROR_THRESHOLD)) {
    // if less than 24 hours have elapsed, just increment the counter for the number of alerts
    // that would have been generated
    if (blockTimestamp.minus(tokenAlert.tStart) < ALERT_MINIMUM_INTERVAL_SECONDS) {
      tokenAlert.numAlertsInLastDay += 1;
    } else {
      // restart the alert counter for this token
      tokenAlert.numAlertsInLastDay = 0;
      tokenAlert.tStart = new BigNumber(blockTimestamp.toString());

      // create the alert
      return createAlert(
        reserveToken,
        oraclePrice,
        fallbackPrice,
        percentError,
        tokenAlert,
        data,
      );
    }
  }

  return [];
}

function provideHandleBlock(data) {
  return async function handleBlock(blockEvent) {
    const { tokenContractFallbackAlertTuples } = data;

    // override block number so we get data from the block in question
    const override = { blockTag: blockEvent.blockNumber };

    // get the block timestamp
    const blockTimestamp = new BigNumber(blockEvent.block.timestamp);

    // for each reserve token, get the price source address and timestamp
    // forEach does not work with async and promises
    // attach a .catch() method to each promise to prevent any rejections from causing Promise.all
    // from failing fast
    const findings = (await Promise.all(tokenContractFallbackAlertTuples.map(
      (tokenContracts) => checkOracleAndFallback(tokenContracts, override, blockTimestamp, data)
        .catch((error) => console.error(error)),
    ))).flat();

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeData),
  calculatePercentError,
};
