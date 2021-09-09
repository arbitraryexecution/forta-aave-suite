const ethers = require('ethers');
const BigNumber = require('bignumber.js');
const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');
const {
  provideHandleBlock,
} = require('./total-value-and-liquidity.js');

// mockable libraries
const RollingMath = require('rolling-math');
jest.mock('rolling-math');

// get config settings
const Config = require('../../agent-config.json')['total-value-and-liquidity'];

// data fields we are interested in
const dataFields = [
  'availableLiquidity',
  'totalStableDebt',
  'totalVariableDebt',
  'totalDebt',
  'totalValueLocked',
];

// creates a mock class implementation with constructor
// returns references to mocked funcs
function mockLibrary(baseMockLibrary, overrides) {
  const mockImplementation = jest.fn(function () {
    // funcs will contain the mocked classes function definitions
    // first add the base unimplemented classes
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

describe('liquidity and total value locked agent tests', () => {
  let handleTransaction;
  let mockLendingPool;
  let mockData;
  let mockDataProvider;
  let mockRollingMath;
  let mockRollingMathFuncs;
  let mockConfig;

  // we need to set up our testing environment for each test
  beforeEach(() => {
    // defaults must be reinitialized each test otherwise updating mock function implementations
    // will actually be updating our default array and affect other tests
    const baseRollingMath = {
      getWindowSize: jest.fn(function() {
        return this.arg0;
      }),
      getNumElements: jest.fn(() => 0),
      getSum: jest.fn(() => new BigNumber(0)),
      getAverage: jest.fn(() => new BigNumber(0)),
      getStandardDeviation: jest.fn(() => new BigNumber(0)),
      addElement: jest.fn(() => 0),
    };

    // need to create a mocked lending pool contract instance
    mockLendingPool = {
      getReservesList: jest.fn(() => Promise.resolve(
        [ "0xFAKEADDRESS", ]
      )),
    }

    mockData = {};
    dataFields.forEach((field) => {
      mockData[field] = ethers.BigNumber.from(0);
    });

    mockDataProvider = {
      getReserveData: jest.fn(() => Promise.resolve(
        mockData
      )),
    }

    const mockedLib = mockLibrary(baseRollingMath, {}); 
    ({ mockImplementation: mockRollingMath, mockFunctions: mockRollingMathFuncs } = mockedLib);

    RollingMath.mockImplementation(mockRollingMath);

    mockConfig = { ...Config };

    handleTransaction = provideHandleBlock(RollingMath, mockConfig, mockLendingPool, mockDataProvider);
  });

  describe('configurations work for', () => {
    it('window size', async () => {
      // set window size to a unique and non default number
      mockConfig.windowSize = 389012;

      // run a block through
      await handleTransaction({blockNumber: 0});

      // we should have a single instance of our rolling math library for each
      // data field, all with our custom size
      expect(mockRollingMath).toBeCalledTimes(dataFields.length);
      expect(mockRollingMath).toBeCalledWith(mockConfig.windowSize);
    });

    it('standard devation limit', async () => {
      // run a block to initialize our data
      await handleTransaction({blockNumber: 0});

      // set standard devation limit to a unique and non default number
      mockConfig.numStds = 40;

      // make our math module return more than minimum required elements
      mockRollingMathFuncs.getNumElements.mockImplementation(
        jest.fn(() => mockConfig.minElements + 1)
      );

      // make our math module return predictable values
      mockRollingMathFuncs.getAverage.mockImplementation(
        jest.fn(() => new BigNumber(10))
      );
      mockRollingMathFuncs.getStandardDeviation.mockImplementation(
        jest.fn(() => new BigNumber(1))
      );

      // ensure observations below standard devation we do not alert
      mockData.totalStableDebt = ethers.BigNumber.from(40 * 1 + 10);

      // since we are equal to but not passing the limit we should not get back
      // any findings
      expect(await handleTransaction({blockNumber: 0})).toStrictEqual([]);

      // make observations larger than our standard devation limit
      mockData.totalStableDebt = ethers.BigNumber.from(40 * 1 + 10 + 1);

      // since we are outside of the limit, expect a finding
      expect(await handleTransaction({blockNumber: 0})).not.toStrictEqual([]);
    });

    it('minimum elements before triggering', async () => {
      // run a block to initialize our data
      await handleTransaction({blockNumber: 0});

      // set up our observations to be outside of standard devaition range
      // since default average and standard devation returned is 0, any number will suffice
      mockData.totalStableDebt = ethers.BigNumber.from(100);

      // set number of required elements to an arbitrary value
      mockConfig.minElements = 1882;

      // since default getNumElements returns 0, we should not expect a finding
      expect(await handleTransaction({blockNumber: 0})).toStrictEqual([]);

      // make our math library return a larger number of elements than required
      mockRollingMathFuncs.getNumElements.mockImplementation(
        jest.fn(() => mockConfig.minElements + 1
      );

      // now that we report a substantial number of elements, expect a finding
      expect(await handleTransaction({blockNumber: 0})).not.toStrictEqual([]);
    });
  });

  describe('doesn\'t alert when', () => {
    it('observation isn\'t outside standard deviation limit', async () => {
      // run a block to initialize our data
      await handleTransaction({blockNumber: 0});

      // set our standard devation to be really large so it won't alert
      mockRollingMathFuncs.getStandardDeviation.mockImplementation(
        jest.fn(() => 9001);
      );
    });
    /*

    it('there aren\'t enough previously recorded elements', async () => {
    });

    it('it is the first element seen', async () => {
    });
  });

  describe('whenever you pass a block it', () => {
    it('will add the observation into the dataset', async () => {
    });

    it('will create a new data set if it hasn\'t seen the address before', async () => {
    });

    it('will call each function with the specific block in question', async () => {
    });

    it('will get reserves and grab the data from the reserves', async () => {
    });
  });

  describe('alerts when', () => {
    it('recieves an event that is outside the std limit and has adequate previous data', async () => {
    });
    */
  });
});







/*


const myOverrides = { getSum: jest.fn(() => 420) };

const res = mockLibrary(baseRollingMath, myOverrides);
RollingMath.mockImplementation(res.mockImplementation);
const testRollingMath = new RollingMath(69);
console.log(testRollingMath.getWindowSize());
console.log(testRollingMath.getSum());
console.log(res.mockFunctions.getSum.mock.calls.length);
console.log(testRollingMath.getSum());
console.log(res.mockFunctions.getSum.mock.calls.length);
res.mockFunctions.getSum.mockImplementation(jest.fn(() => 9001));
console.log(testRollingMath.getSum());
console.log(res.mockFunctions.getSum.mock.calls.length);
console.log(res.mockFunctions.getSum);

console.log(RollingMath);
RollingMath.mock.instances[0].getSum.mockImplementation(jest.fn(() => 9002));

console.log(testRollingMath.getSum());

// helper function to create alerts
function createAlert(data) {
  return Finding.fromObject({
    name: `Anomolous AAVE ${data.field}`,
    description: `Reserve: ${data.reserve}`,
    alertId: `AAVE-ANOMOLOUS-${data.field.toUpperCase()}`,
    severity: FindingSeverity.High,
    type: FindingType.Suspicious,
    metadata: JSON.stringify(data),
  }); 
}


getStandardDeviation*/
