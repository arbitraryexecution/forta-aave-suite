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
const RollingMath = require('rolling-math');
const BigNumber = require('bignumber.js');
const { provideInitialize, provideHandleBlock } = require('./agent');
const config = require('../bot-config.json');

jest.mock('rolling-math');

// setup mocks for rolling math library
const baseRollingMath = {
  getWindowSize: jest.fn(function fn() { return this.arg0; }),
  getNumElements: jest.fn(() => config.reserveWatch.windowSize),
  getSum: jest.fn(() => new BigNumber(0)),
  getAverage: jest.fn(() => new BigNumber(0)),
  getStandardDeviation: jest.fn(() => new BigNumber(0)),
  addElement: jest.fn(() => 0),
};

// creates a mock class implementation with constructor
// returns references to mocked funcs
function mockLibrary(baseMockLibrary, overrides) {
  const mockImplementation = jest.fn((...args) => {
    // funcs will contain the mocked classes function definitions
    // first add the base unimplemented classes

    const funcs = {
      ...baseMockLibrary,
    };

    // update constructor arguments, they can be referenced inside of the function
    // implementations with the name `arg0`, `arg1`, ..., `argN`
    Object.entries(args).forEach((entry) => {
      const idx = 1;
      funcs['arg'.concat(entry[0])] = entry[idx];
    });

    // override function definitions and constructor arguments
    Object.assign(funcs, overrides);

    return funcs;
  });

  // return the mock implementation and handles to all mock functions
  return {
    mockImplementation,
    mockFunctions: {
      ...baseMockLibrary,
      ...overrides,
    },
  };
}

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
  });

  describe('Reserve Monitoring', () => {
    it('returns empty if reserve price swing is below threshold', async () => {
      // mock RollingMath to return a large average
      const overrides = {
        getAverage: () => jest.fn(() => new BigNumber('1e300')),
        getStandardDeviation: jest.fn(() => new BigNumber('1e300')),
      };

      const res = mockLibrary(baseRollingMath, overrides);
      RollingMath.mockImplementation(res.mockImplementation);

      // get the first round of prices and initialize RollingMath objects
      await handleBlock(blockEvent);

      const findings = await handleBlock(blockEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns empty if reserve price swing is above threshold but not enough blocks have been seen yet', async () => {
      const overrides = {
        getAverage: jest.fn(() => new BigNumber(0)),
        getStandardDeviation: jest.fn(() => new BigNumber(0)),
        getNumElements: jest.fn(() => config.windowSize - 1),
      };

      const res = mockLibrary(baseRollingMath, overrides);
      RollingMath.mockImplementation(res.mockImplementation);

      // get the first round of prices and initialize RollingMath objects
      await handleBlock(blockEvent);

      const findings = await handleBlock(blockEvent);
      expect(findings).toStrictEqual([]);
    });

    it('returns findings if reserve price swing is above threshold', async () => {
      const overrides = {
        getAverage: jest.fn(() => new BigNumber(0)),
        getStandardDeviation: jest.fn(() => new BigNumber(0)),
      };

      const res = mockLibrary(baseRollingMath, overrides);
      RollingMath.mockImplementation(res.mockImplementation);

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
