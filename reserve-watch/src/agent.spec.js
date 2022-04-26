// create mock values used for testing
const mockReserveToken = { symbol: 'FAKE1', tokenAddress: '0xFIRSTFAKETOKENADDRESS' };

// create a mock contract that contains the methods used when initializing the bot
const mockCombinedContract = {
  getAllReservesTokens: jest.fn().mockResolvedValue([mockReserveToken]),
  getAssetPrice: jest.fn().mockResolvedValue('0x1'),
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

const {
  BlockEvent, Finding, FindingType, FindingSeverity, ethers,
} = require('forta-agent');
const BigNumber = require('bignumber.js');
const { provideInitialize, provideHandleBlock } = require('./agent');
const config = require('../bot-config.json');

// create mock functions for mocking the rolling-math module
const mockNumElements = jest.fn().mockReturnValue(config.reserveWatch.windowSize);
const mockSum = jest.fn();
const mockAverage = jest.fn();
const mockStandardDeviation = jest.fn();
const mockAddElement = jest.fn().mockReturnValue(0);

// mock the rolling-math module
jest.mock('rolling-math', () => jest.fn().mockImplementation(() => ({
  getWindowSize: jest.fn().mockReturnValue(this.arg0),
  getNumElements: mockNumElements,
  getSum: mockSum,
  getAverage: mockAverage,
  getStandardDeviation: mockStandardDeviation,
  addElement: mockAddElement,
})));

// helper function for creating mock block events
function createBlockEvent(block) {
  return new BlockEvent(0, 1, block);
}

describe('Aave reserve price agent', () => {
  let handleBlock;
  let initializeData;

  const blockEvent = createBlockEvent({
    blockHash: '0xa',
    blockNumber: 12345,
  });

  beforeEach(async () => {
    initializeData = {};

    // initialize the handler
    await (provideInitialize(initializeData))();
    handleBlock = provideHandleBlock(initializeData);

    // reset rolling-math mocks to default values
    mockNumElements.mockReturnValue(config.reserveWatch.windowSize);
    mockSum.mockReturnValue(new BigNumber(0));
    mockAverage.mockReturnValue(new BigNumber(0));
    mockStandardDeviation.mockReturnValue(new BigNumber(0));
  });

  describe('Reserve Monitoring', () => {
    it('returns empty if reserve price swing is below threshold', async () => {
      // mock RollingMath to return a large average and standard deviation
      mockAverage.mockReturnValue(new BigNumber('1e300'));
      mockStandardDeviation.mockReturnValue(new BigNumber('1e300'));

      // get the first round of prices and initialize RollingMath objects
      await handleBlock(blockEvent);

      const findings = await handleBlock(blockEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns empty if reserve price swing is above threshold but not enough blocks have been seen yet', async () => {
      mockAverage.mockReturnValue(new BigNumber(0));
      mockStandardDeviation.mockReturnValue(new BigNumber(0));
      mockNumElements.mockReturnValue(config.windowSize - 1);

      // get the first round of prices and initialize RollingMath objects
      await handleBlock(blockEvent);

      const findings = await handleBlock(blockEvent);
      expect(findings).toStrictEqual([]);
    });

    it('returns findings if reserve price swing is above threshold', async () => {
      mockAverage.mockReturnValue(new BigNumber(0));
      mockStandardDeviation.mockReturnValue(new BigNumber(0));

      // get the first round of prices and initialize RollingMath objects
      await handleBlock(blockEvent);

      const price = ethers.utils.formatEther(1);
      const expectedFinding = Finding.fromObject({
        name: 'High Aave FAKE1 Reserve Price Change',
        description: `FAKE1 Price: ${price} ether`,
        alertId: 'AE-AAVE-RESERVE-PRICE',
        severity: FindingSeverity.Medium,
        type: FindingType.Suspicious,
        metadata: {
          symbol: 'FAKE1',
          price,
        },
      });

      // mocked RollingMath will trigger findings on the next block
      const findings = await handleBlock(blockEvent);
      expect(findings).toStrictEqual([expectedFinding]);
    });
  });
});
