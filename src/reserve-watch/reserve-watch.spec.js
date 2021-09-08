const {
  TransactionEvent,
  FindingType,
  FindingSeverity,
  Finding,
  getJsonRpcUrl
} = require("forta-agent");

const { provideHandleBlock, teardownProvider } = require("./reserve-watch");
const BigNumber = require("bignumber.js");
const ethers = require("ethers");
const RollingMath = require("rolling-math");

jest.mock("rolling-math");

const baseRollingMath = {
  getWindowSize: jest.fn(function() {
    return this.arg0;
  }),
  getElements: jest.fn(() => 0),
  getSum: jest.fn(() => 0),
  getAverage: jest.fn(() => 0),
  getStandardDeviation: jest.fn(() => 0),
  addElement: jest.fn(() => 0),
};

// creates a mock class implementation with constructor
// returns references to mocked funcs
function mockLibrary(baseMockLibrary, overrides) {
  const mockImplementation = jest.fn(function () {
    // funcs will contain the mocked classes function definitions
    // first add the base unimplemented classes
    //
    // TODO: this is dangerous because it won't fail if someone doesn't mock their
    // function properly
    const funcs = {
      ...baseMockLibrary,
    };

    // update constructor aruments, they can be referenced inside of the function
    // implementations with the name `arg0`, `arg1`, ..., `argN`
    Object.entries(arguments).forEach((entry) => {
      funcs[ 'arg'.concat(entry[0]) ] = entry[1];
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
    }
  }
}

describe("Aave reserve price agent", () => {
  let handleBlock;

  afterAll(() => { 
    teardownProvider();
  });

  describe("Reserve Monitoring", () => {
    it("returns empty if reserve price swing is below threshold", async () => {
      // Mock RollingMath to return a large average
      const myOverrides = { getAverage: () => new BigNumber('1e300'),
                            getStandardDeviation: () => new BigNumber(0)};
      
      const res = mockLibrary(baseRollingMath, myOverrides);
      RollingMath.mockImplementation(res.mockImplementation);
      
      handleBlock = provideHandleBlock(RollingMath);
      
      // Get the first round of prices and initialize RollingMath objects
      await handleBlock({});

      // mocked RollingMath will trigger findings on the next block
      const findings = await handleBlock({});

      expect(findings).toStrictEqual([]);
    });

    it("returns findings if reserve price swing is above threshold", async () => {
      const myOverrides = { getAverage: () => new BigNumber(0),
                            getStandardDeviation: () => new BigNumber(0)};
      
      const res = mockLibrary(baseRollingMath, myOverrides);
      RollingMath.mockImplementation(res.mockImplementation);
      
      handleBlock = provideHandleBlock(RollingMath);
      
      await handleBlock({});

      // mocked RollingMath will trigger findings on the next block
      const findings = await handleBlock({});
      expect(findings).not.toStrictEqual([]);
    });
  });
});
