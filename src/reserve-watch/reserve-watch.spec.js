const { createBlockEvent } = require('forta-agent');
const BigNumber = require('bignumber.js');
const RollingMath = require('rolling-math');
const { provideHandleBlock, createAlert } = require('./reserve-watch');
const { reserveWatch: config } = require('../../agent-config.json');

jest.mock('rolling-math');

const baseRollingMath = {
  getWindowSize: jest.fn(function fn() { return this.arg0; }),
  getNumElements: jest.fn(() => config.windowSize),
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

describe('Aave reserve price agent', () => {
  let handleBlock;
  let mockData;
  let mockProtocolDataProvider;
  let mockPriceOracle;

  beforeEach(() => {
    mockData = [{ symbol: 'TEST', tokenAddress: '0xDEAD' }];

    mockProtocolDataProvider = {
      getAllReservesTokens: jest.fn(() => Promise.resolve(
        mockData,
      )),
    };

    mockPriceOracle = {
      getAssetPrice: jest.fn(() => Promise.resolve(
        '0x1',
      )),
    };
  });

  const blockEvent = createBlockEvent({
    blockHash: '0xa',
    blockNumber: 1,
    block: {},
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

      handleBlock = provideHandleBlock(RollingMath, mockProtocolDataProvider, mockPriceOracle);
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

      handleBlock = provideHandleBlock(RollingMath, mockProtocolDataProvider, mockPriceOracle);

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

      handleBlock = provideHandleBlock(RollingMath, mockProtocolDataProvider, mockPriceOracle);

      await handleBlock(blockEvent);
      const asset = mockData[0];
      const test = [createAlert(asset, 1)];
      // mocked RollingMath will trigger findings on the next block
      const findings = await handleBlock(blockEvent);
      expect(findings).toStrictEqual(test);
    });
  });
});
