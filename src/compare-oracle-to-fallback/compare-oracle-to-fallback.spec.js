// required libraries
const BigNumber = require('bignumber.js');
const { createBlockEvent } = require('forta-agent');
const { 
  provideHandleBlock,
  createAlert,
  calculatePercentError
} = require('./compare-oracle-to-fallback');

const SECONDS_PER_DAY = 86400;

describe('AAVE oracle versus fallback oracle agent', () => {
  let handleBlock;

  function getMockFunction(assetPriceOracle, assetPriceFallback, tStart) {
    // this function allows us to mock the behavior of the initializeTokensContracts function
    // in production, that function:
    return function mockTokensContractsAlertsPromise() {
      // create a token
      const reserveToken = { symbol: 'FAKE1', tokenAddress: '0xFIRSTFAKETOKENADDRESS' };

      // create a mock price oracle contract for returning the value we want to test with
      const priceOracleContractInstance = {
        getAssetPrice: jest.fn(() => Promise.resolve(assetPriceOracle)),
      };

      // create a mock fallback oracle contract for returning the value we want to test with
      const fallbackOracleContractInstance = {
        getAssetPrice: jest.fn(() => Promise.resolve(assetPriceFallback)),
      };

      // create an object to track the number of token alerts in the last day
      const tokenAlert = { numAlertsInLastDay: 0, tStart };

      // create the Array of Tuples of tokens / oracle / fallback / alerts objects
      const tokenContractFallbackAlertTuples = [
        {
          reserveToken, priceOracleContractInstance, fallbackOracleContractInstance, tokenAlert,
        },
      ];

      // wrap the Array of Tuples in a Promise (which we will resolve immediately)
      // the original function returns a Promise that is resolved when all contract interactions
      // have finished
      return Promise.resolve(tokenContractFallbackAlertTuples);
    };
  }

  describe('Fallback Price Oracle Monitoring', () => {
    it('returns findings if percent error between oracle and fallback is > 2%'
      + ' and last alert was created more than 24 hours ago', async () => {
      // create an oracle asset price an a fallback oracle price that will trigger an alert
      const assetPriceOracle = new BigNumber(100);
      const assetPriceFallback = new BigNumber(97.9);

      // create a timestamp
      const blockTimestamp = 1234567890;

      // create a timestamp for when the last alert was triggered, greater than 24 hours ago
      const tStart = blockTimestamp - SECONDS_PER_DAY - 1;

      // need to create blockEvent (with .block.timestamp and .blockNumber)
      const mockedBlockEvent = createBlockEvent({
        blockNumber: 12345,
        block: {
          timestamp: blockTimestamp,
        },
      });

      // create the mocked promise to pass in to provideHandleBlock
      const tokensContractsAlerts = getMockFunction(assetPriceOracle, assetPriceFallback, tStart);

      // create the block handler
      handleBlock = provideHandleBlock(tokensContractsAlerts);

      // create expected finding
      const { reserveToken } = (await tokensContractsAlerts())[0];
      const percentError = calculatePercentError(assetPriceOracle, assetPriceFallback);
      const numAlertsInLastDay = 0;

      const expectedFinding = createAlert(
        reserveToken,
        assetPriceOracle,
        assetPriceFallback,
        percentError,
        { numAlertsInLastDay },
      );

      // we expect to trigger an alert based on the percent error and the age being 24 hr + 1 sec
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([expectedFinding]);
    });

    it('returns no findings if last alert was created less than 24 hours ago', async () => {
      // create an oracle asset price an a fallback oracle price that will trigger an alert
      const assetPriceOracle = new BigNumber(100);
      const assetPriceFallback = new BigNumber(0);

      // create a timestamp
      const blockTimestamp = 1234567890;

      // create a timestamp for when the last alert was triggered, less than 24 hours ago
      const tStart = blockTimestamp - SECONDS_PER_DAY + 1;

      // need to create blockEvent (with .block.timestamp and .blockNumber)
      const mockedBlockEvent = createBlockEvent({
        blockNumber: 12345,
        block: {
          timestamp: blockTimestamp,
        },
      });

      // create the mocked promise to pass in to provideHandleBlock
      const tokensContractsAlerts = getMockFunction(assetPriceOracle, assetPriceFallback, tStart);

      // create the block handler
      handleBlock = provideHandleBlock(tokensContractsAlerts);

      // we expect no alerts because the previous alert occurred within the last 24 hours
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([]);

      // we also expect that the variable tracking the number of alerts in the last 24 hours will
      // be incremented by 1
      const { tokenAlert } = (await tokensContractsAlerts())[0];
      expect(tokenAlert.numAlertsInLastDay).toStrictEqual(1);
    });

    it('returns no findings if percent error is <=  2%', async () => {
      // create an oracle asset price an a fallback oracle price that will trigger an alert
      const assetPriceOracle = new BigNumber(100);
      const assetPriceFallback = new BigNumber(98);

      // create a timestamp
      const blockTimestamp = 1234567890;

      // create a timestamp for when the last alert was triggered, greater than 24 hours ago
      const tStart = blockTimestamp - SECONDS_PER_DAY - 1;

      // need to create blockEvent (with .block.timestamp and .blockNumber)
      const mockedBlockEvent = createBlockEvent({
        blockNumber: 12345,
        block: {
          timestamp: blockTimestamp,
        },
      });

      // create the mocked promise to pass in to provideHandleBlock
      const tokensContractsAlerts = getMockFunction(assetPriceOracle, assetPriceFallback, tStart);

      // create the block handler
      handleBlock = provideHandleBlock(tokensContractsAlerts);

      // we expect no alerts because the previous alert occurred within the last 24 hours
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([]);
    });
  });
});
