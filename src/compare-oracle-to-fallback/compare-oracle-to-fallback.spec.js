// required libraries
const BigNumber = require('bignumber.js');
const {
  Finding,
  FindingSeverity,
  FindingType,
  createBlockEvent,
} = require('forta-agent');
const { provideHandleBlock, teardownProvider } = require('./compare-oracle-to-fallback');

const SECONDS_PER_DAY = 86400;

describe('AAVE oracle versus fallback oracle agent', () => {
  let handleBlock;

  afterEach(() => {
    teardownProvider();
  });

  // this function allows us to mock the behavior of the initializeTokensContracts function
  // in production, that function:
  function mockTokensContractsAlertsPromise(assetPriceOracle, assetPriceFallback, tStart) {
    // create a token
    const token = { symbol: 'FAKE1', tokenAddress: '0xFIRSTFAKETOKENADDRESS' };

    // create a mock price oracle contract for returning the value we want to test with
    const oracleContract = { getAssetPrice: jest.fn(() => Promise.resolve(assetPriceOracle)) };

    // create a mock fallback oracle contract for returning the value we want to test with
    const fallbackContract = { getAssetPrice: jest.fn(() => Promise.resolve(assetPriceFallback)) };

    // create an object to track the number of token alerts in the last day
    const tokenAlert = { numAlertsInLastDay: 0, tStart };

    // create the Array of Tuples of tokens / oracle / fallback / alerts objects
    const tokenContractFallbackAlertTuples = [
      [token, oracleContract, fallbackContract, tokenAlert],
    ];

    // wrap the Array of Tuples in a Promise (which we will resolve immediately)
    // the original function returns a Promise that is resolved when all contract interactions have
    // finished
    return Promise.resolve(tokenContractFallbackAlertTuples);
  }

  function calculatePercentError(first, second) {
    const delta = first.minus(second).absoluteValue();
    return delta.div(first).multipliedBy(100);
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
      const promise = await mockTokensContractsAlertsPromise(
        assetPriceOracle,
        assetPriceFallback,
        tStart,
      );

      // create the block handler
      handleBlock = provideHandleBlock(promise);

      // create expected finding
      const token = promise[0][0];
      const percentError = calculatePercentError(assetPriceOracle, assetPriceFallback);
      const numAlertsInLastDay = 0;
      const expectedFinding = Finding.fromObject({
        name: `Large AAVE Price Oracle / Fallback Oracle Difference for ${token.symbol}`,
        description:
          `Token: ${token.symbol}, Price: ${assetPriceOracle.toString()}, `
          + `Fallback Price: ${assetPriceFallback.toString()}, `
          + `Number of alerts in last 24 hours: ${numAlertsInLastDay.toString()}`,
        alertId: 'AE-AAVE-FALLBACK-ORACLE-DISPARITY',
        severity: FindingSeverity.Medium,
        type: FindingType.Suspicious,
        everestId: '0xa3d1fd85c0b62fa8bab6b818ffc96b5ec57602b6',
        metadata: {
          symbol: token.symbol,
          tokenAddress: token.tokenAddress,
          tokenPrice: assetPriceOracle,
          tokenPriceFallback: assetPriceFallback,
          percentError,
          numAlertsInLastDay,
        },
      });

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
      const promise = await mockTokensContractsAlertsPromise(
        assetPriceOracle,
        assetPriceFallback,
        tStart,
      );

      // create the block handler
      handleBlock = provideHandleBlock(promise);

      // we expect no alerts because the previous alert occurred within the last 24 hours
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([]);

      // we also expect that the variable tracking the number of alerts in the last 24 hours will
      // be incremented by 1
      expect(promise[0][3].numAlertsInLastDay).toStrictEqual(1);
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
      const promise = await mockTokensContractsAlertsPromise(
        assetPriceOracle,
        assetPriceFallback,
        tStart,
      );

      // create the block handler
      handleBlock = provideHandleBlock(promise);

      // we expect no alerts because the previous alert occurred within the last 24 hours
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([]);
    });
  });
});
