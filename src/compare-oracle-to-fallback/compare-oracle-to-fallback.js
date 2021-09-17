const BigNumber = require('bignumber.js');

const { compareOracleToFallback } = require('../../agent-config.json');
const {
  initializeTokensContractsAlerts,
  createAlert,
  calculatePercentError
} = require('./agent-setup');

// NOTE: this value is imported from agent-config.json
// percent error threshold over which we trigger alerts
//   percent error = (absolute(oracle - fallbackOracle) / oracle) * 100
const AAVE_ORACLE_PERCENT_ERROR_THRESHOLD = compareOracleToFallback.aaveOraclePercentErrorThreshold;
const ALERT_MINIMUM_INTERVAL_SECONDS = compareOracleToFallback.alertMinimumIntervalSeconds;

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
};
