// create mock initialize values
const mockReserveToken = { symbol: 'FAKE1', tokenAddress: '0xFIRSTFAKETOKENADDRESS' };
const mockOracleAddress = '0xMOCKORACLEADDRESS';
const mockFallbackOracleAddress = '0xMOCKFALLBACKORACLEADDRESS';

// create a mock contract that contains the methods used when initializing the bot
const mockCombinedContract = {
  getAllReservesTokens: jest.fn().mockResolvedValue([mockReserveToken]),
  getPriceOracle: jest.fn().mockResolvedValue(mockOracleAddress),
  getFallbackOracle: jest.fn().mockResolvedValue(mockFallbackOracleAddress),
  getAssetPrice: jest.fn(),
};

// combine the mocked provider and contracts into the ethers import mock
jest.mock('forta-agent', () => ({
  ...jest.requireActual('forta-agent'),
  getEthersProvider: jest.fn(),
  ethers: {
    ...jest.requireActual('ethers'),
    Contract: jest.fn().mockReturnValue(mockCombinedContract),
  },
}));

// required libraries
const {
  BlockEvent, FindingType, FindingSeverity, Finding,
} = require('forta-agent');
const BigNumber = require('bignumber.js');

const { provideInitialize, provideHandleBlock, calculatePercentError } = require('./agent');

function createBlockEvent(block) {
  return new BlockEvent(0, 1, block);
}

describe('Aave oracle versus fallback oracle bot', () => {
  const alertMinimumIntervalSeconds = 86400; // 24 hours
  let initializeData;
  let handleBlock;

  beforeEach(async () => {
    initializeData = {};

    // initialize the handler
    await (provideInitialize(initializeData))();
    handleBlock = provideHandleBlock(initializeData);

    initializeData.percentErrorThreshold = 2;
    initializeData.alertMinIntervalSeconds = alertMinimumIntervalSeconds;
  });

  describe('Fallback Price Oracle Monitoring', () => {
    it('returns findings if percent error between oracle and fallback is greater than the threshold and the last alert was created more than 24 hours ago', async () => {
      // create an oracle asset price an a fallback oracle price that will trigger an alert
      const assetPriceOracle = new BigNumber(100);
      const assetPriceFallback = new BigNumber(97.9);

      // create a timestamp
      const blockTimestamp = 1234567890;

      // create a timestamp for when the last alert was triggered, greater than 24 hours ago
      const tStart = blockTimestamp - alertMinimumIntervalSeconds - 1;

      // set the return values for the mocked oracles and token alert time since last triggered
      initializeData.tokenContractFallbackAlertTuples[0].aaveOracleContractInstance.getAssetPrice
        .mockResolvedValueOnce(assetPriceOracle);
      initializeData.tokenContractFallbackAlertTuples[0].fallbackOracleContractInstance
        .getAssetPrice
        .mockResolvedValueOnce(assetPriceFallback);
      initializeData.tokenContractFallbackAlertTuples[0].tokenAlert.tStart = tStart;

      // need to create blockEvent (with .block.timestamp and .blockNumber)
      const mockedBlockEvent = createBlockEvent({
        blockNumber: 12345,
        timestamp: blockTimestamp,
      });

      // create expected finding
      const percentError = calculatePercentError(assetPriceOracle, assetPriceFallback);
      const expectedFinding = Finding.fromObject({
        name: `Aave Fallback Oracle Price Difference for ${mockReserveToken.symbol}`,
        description:
          `Token: ${mockReserveToken.symbol}, Price: ${assetPriceOracle}, Fallback Price: `
          + `${assetPriceFallback}, Number of alerts in last 24 hours: 0`,
        alertId: 'AE-AAVE-FALLBACK-ORACLE-DISPARITY',
        severity: FindingSeverity.High,
        type: FindingType.Degraded,
        metadata: {
          symbol: mockReserveToken.symbol,
          tokenAddress: mockReserveToken.tokenAddress,
          tokenPrice: assetPriceOracle,
          tokenPriceFallback: assetPriceFallback,
          percentError,
          numAlertsInLastDay: 0,
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
      const tStart = blockTimestamp - alertMinimumIntervalSeconds + 1;

      // set the return values for the mocked oracles and token alert time since last triggered
      initializeData.tokenContractFallbackAlertTuples[0].aaveOracleContractInstance.getAssetPrice
        .mockResolvedValueOnce(assetPriceOracle);
      initializeData.tokenContractFallbackAlertTuples[0].fallbackOracleContractInstance
        .getAssetPrice
        .mockResolvedValueOnce(assetPriceFallback);
      initializeData.tokenContractFallbackAlertTuples[0].tokenAlert.tStart = tStart;

      // need to create blockEvent (with .block.timestamp and .blockNumber)
      const mockedBlockEvent = createBlockEvent({
        blockNumber: 12345,
        timestamp: blockTimestamp,
      });

      // we expect no alerts because the previous alert occurred within the last 24 hours
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([]);

      // we also expect that the variable tracking the number of alerts in the last 24 hours will
      // be incremented by 1
      const { tokenAlert } = initializeData.tokenContractFallbackAlertTuples[0];
      expect(tokenAlert.numAlertsInLastDay).toStrictEqual(1);
    });

    it('returns the correct number of alerts in last 24 hour period when a finding is generated', async () => {
      // create an oracle asset price an a fallback oracle price that will trigger an alert
      const assetPriceOracle = new BigNumber(100);
      const assetPriceFallback = new BigNumber(0);

      // create a timestamp
      let blockTimestamp = 1234567890;

      // create a timestamp for when the last alert was triggered, less than 24 hours ago
      const tStart = blockTimestamp - alertMinimumIntervalSeconds + 1;

      // set the return values for the mocked oracles and token alert time since last triggered
      initializeData.tokenContractFallbackAlertTuples[0].aaveOracleContractInstance
        .getAssetPrice
        .mockResolvedValueOnce(assetPriceOracle);
      initializeData.tokenContractFallbackAlertTuples[0].fallbackOracleContractInstance
        .getAssetPrice
        .mockResolvedValueOnce(assetPriceFallback);
      initializeData.tokenContractFallbackAlertTuples[0].tokenAlert.tStart = tStart;

      // need to create blockEvent (with .block.timestamp and .blockNumber)
      let mockedBlockEvent = createBlockEvent({
        blockNumber: 12345,
        timestamp: blockTimestamp,
      });

      // we expect no alerts because the previous alert occurred within the last 24 hours
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([]);

      // now set the block timestamp to be greater than 24 hours ago
      blockTimestamp += alertMinimumIntervalSeconds;
      mockedBlockEvent = createBlockEvent({
        blockNumber: 23456,
        timestamp: blockTimestamp,
      });

      // set the return values for the mocked oracles
      initializeData.tokenContractFallbackAlertTuples[0].aaveOracleContractInstance
        .getAssetPrice
        .mockResolvedValueOnce(assetPriceOracle);
      initializeData.tokenContractFallbackAlertTuples[0].fallbackOracleContractInstance
        .getAssetPrice
        .mockResolvedValueOnce(assetPriceFallback);

      // create expected finding
      const percentError = calculatePercentError(assetPriceOracle, assetPriceFallback);
      const expectedFinding = Finding.fromObject({
        name: `Aave Fallback Oracle Price Difference for ${mockReserveToken.symbol}`,
        description:
          `Token: ${mockReserveToken.symbol}, Price: ${assetPriceOracle}, Fallback Price: `
          + `${assetPriceFallback}, Number of alerts in last 24 hours: 1`,
        alertId: 'AE-AAVE-FALLBACK-ORACLE-DISPARITY',
        severity: FindingSeverity.High,
        type: FindingType.Degraded,
        metadata: {
          symbol: mockReserveToken.symbol,
          tokenAddress: mockReserveToken.tokenAddress,
          tokenPrice: assetPriceOracle,
          tokenPriceFallback: assetPriceFallback,
          percentError,
          numAlertsInLastDay: 1,
        },
      });

      // we expect to trigger an alert based on:
      //  the percent error and the last alert age being > 24 hrs
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([expectedFinding]);
    });

    it('returns no findings if percent error is below the threshold', async () => {
      // create an oracle asset price an a fallback oracle price that will trigger an alert
      const assetPriceOracle = new BigNumber(100);
      const assetPriceFallback = new BigNumber(98);

      // create a timestamp
      const blockTimestamp = 1234567890;

      // create a timestamp for when the last alert was triggered, greater than 24 hours ago
      const tStart = blockTimestamp - alertMinimumIntervalSeconds - 1;

      // set the return values for the mocked oracles and token alert time since last triggered
      initializeData.tokenContractFallbackAlertTuples[0].aaveOracleContractInstance.getAssetPrice
        .mockResolvedValueOnce(assetPriceOracle);
      initializeData.tokenContractFallbackAlertTuples[0].fallbackOracleContractInstance
        .getAssetPrice
        .mockResolvedValueOnce(assetPriceFallback);
      initializeData.tokenContractFallbackAlertTuples[0].tokenAlert.tStart = tStart;

      // need to create blockEvent (with .block.timestamp and .blockNumber)
      const mockedBlockEvent = createBlockEvent({
        blockNumber: 12345,
        timestamp: blockTimestamp,
      });

      // we expect no alerts because the previous alert occurred within the last 24 hours
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([]);
    });
  });
});
