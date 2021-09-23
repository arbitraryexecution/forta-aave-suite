// required libraries
const ethers = require('ethers');
const BigNumber = require('bignumber.js');

// shared imports
const RollingMath = require('rolling-math');
const { createAlert, dataFields } = require('./common');

// handler to agent
const {
  provideHandleBlock,
} = require('./total-value-and-liquidity');

// mockable libraries
jest.mock('rolling-math');

// get config settings
const {
  totalValueAndLiquidity: Config,
} = require('../../agent-config.json');

// creates a mock class implementation with constructor
// returns references to mocked funcs
function mockLibrary(baseMockLibrary) {
  // mock instance function
  function mockInstance(...args) {
    // funcs will contain the mocked classes function definitions
    // first add the base unimplemented classes
    const funcs = {
      ...baseMockLibrary,
    };

    // update constructor aruments, they can be referenced inside of the function
    // implementations with the name `arg0`, `arg1`, ..., `argN`
    Object.entries(args).forEach((entry) => {
      const [key, value] = entry;
      funcs['arg'.concat(key)] = value;
    });

    return funcs;
  }

  const mockImplementation = jest.fn(mockInstance);

  // return the mock implementation and handles to all mock functions
  return {
    mockImplementation,
    mockFunctions: {
      ...baseMockLibrary,
    },
  };
}

describe('liquidity and total value locked agent tests', () => {
  // handles to things we will use during testing
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
      getWindowSize: jest.fn(function getWindowSize() {
        return this.arg0;
      }),
      getNumElements: jest.fn(() => 0),
      getSum: jest.fn(() => new BigNumber(0)),
      getAverage: jest.fn(() => new BigNumber(0)),
      getStandardDeviation: jest.fn(() => new BigNumber(0)),
      addElement: jest.fn(() => 0),
    };

    // mock the lending pool to always return our bogus address
    mockLendingPool = {
      getReservesList: jest.fn(() => Promise.resolve(
        ['0xFAKEADDRESS'],
      )),
    };

    // mockData contains the observations of the fields we look for in the handler
    mockData = {};
    dataFields.forEach((field) => {
      mockData[field] = ethers.BigNumber.from(0);
    });

    // mock the data provider to return our observations
    mockDataProvider = {
      getReserveData: jest.fn(() => Promise.resolve(
        mockData,
      )),
    };

    // get instance of mocked rolling math library
    const mockedLib = mockLibrary(baseRollingMath);
    ({ mockImplementation: mockRollingMath, mockFunctions: mockRollingMathFuncs } = mockedLib);

    RollingMath.mockImplementation(mockRollingMath);

    mockConfig = { ...Config };

    handleTransaction = provideHandleBlock(
      RollingMath, mockConfig, mockLendingPool, mockDataProvider,
    );
  });

  describe('configurations work for', () => {
    it('window size', async () => {
      // set window size to a unique and non default number
      mockConfig.windowSize = 389003;

      // run a block through
      await handleTransaction({ blockNumber: 0 });

      // we should have a single instance of our rolling math library for each
      // data field, all with our custom size
      expect(mockRollingMath).toBeCalledTimes(dataFields.length);
      expect(mockRollingMath).toBeCalledWith(mockConfig.windowSize);
    });

    it('standard deviation limit', async () => {
      // run a block to initialize our data
      await handleTransaction({ blockNumber: 0 });

      // set standard deviation limit to a unique and non default number
      mockConfig.numStds = 42;

      // make our math module return more than minimum required elements
      mockRollingMathFuncs.getNumElements.mockImplementation(
        jest.fn(() => mockConfig.minElements + 1),
      );

      // make our math module return predictable values
      mockRollingMathFuncs.getAverage.mockImplementation(
        jest.fn(() => new BigNumber(10)),
      );
      mockRollingMathFuncs.getStandardDeviation.mockImplementation(
        jest.fn(() => new BigNumber(1)),
      );

      // ensure observations below standard deviation we do not alert
      mockData.totalStableDebt = ethers.BigNumber.from(mockConfig.numStds * 1 + 10);

      // since we are equal to but not passing the limit we should not get back
      // any findings
      expect(await handleTransaction({ blockNumber: 0 })).toStrictEqual([]);

      // make observations larger than our standard deviation limit
      mockData.totalStableDebt = ethers.BigNumber.from(mockConfig.numStds * 1 + 10 + 1);

      // since we are outside of the limit, expect a finding
      expect(await handleTransaction({ blockNumber: 0 })).not.toStrictEqual([]);
    });

    it('minimum elements before triggering', async () => {
      // run a block to initialize our data
      await handleTransaction({ blockNumber: 0 });

      // set up our observations to be outside of standard deviation range
      // since default average and standard deviation returned is 0, any number will suffice
      mockData.totalStableDebt = ethers.BigNumber.from(100);

      // set number of required elements to an arbitrary value
      mockConfig.minElements = 1879;

      // since default getNumElements returns 0, we should not expect a finding
      expect(await handleTransaction({ blockNumber: 0 })).toStrictEqual([]);

      // make our math library return a larger number of elements than required
      mockRollingMathFuncs.getNumElements.mockImplementation(
        jest.fn(() => mockConfig.minElements + 1),
      );

      // now that we report a substantial number of elements, expect a finding
      expect(await handleTransaction({ blockNumber: 0 })).not.toStrictEqual([]);
    });
  });

  describe('doesn\'t alert when', () => {
    it('observation isn\'t outside standard deviation limit', async () => {
      // run a block to initialize our data
      await handleTransaction({ blockNumber: 0 });

      // set our standard deviation to be really large so it won't alert
      mockRollingMathFuncs.getStandardDeviation.mockImplementation(
        jest.fn(() => new BigNumber(9001)),
      );

      // set the number of elements to be sufficient
      mockRollingMathFuncs.getNumElements.mockImplementation(
        jest.fn(() => mockConfig.minElements + 1),
      );

      // set large number of standard deviations to make the limit large
      mockConfig.numStds = 10;

      // expect a default finding of 0 to not be past the standard deviation
      expect(await handleTransaction({ blockNumber: 0 })).toStrictEqual([]);
    });

    it('there aren\'t enough previously recorded elements', async () => {
      // run a block to initialize our data
      await handleTransaction({ blockNumber: 0 });

      // set our standard deviation small so it will alert
      mockRollingMathFuncs.getStandardDeviation.mockImplementation(
        jest.fn(() => new BigNumber(1)),
      );

      // set small number of standard deviations
      mockConfig.numStds = 1;

      // set finding to be outside of our standard deviation range
      // standard deviation * limit + anything to get outside the limit
      mockData.totalStableDebt = ethers.BigNumber.from(1 * 1 + 1);

      // set the number of elements to be insufficient
      mockRollingMathFuncs.getNumElements.mockImplementation(
        jest.fn(() => mockConfig.minElements - 1),
      );

      // expect no finding because insufficient number of elements
      expect(await handleTransaction({ blockNumber: 0 })).toStrictEqual([]);
    });
  });

  describe('whenever you pass a block it', () => {
    it('will add the observation into the dataset', async () => {
      // run a block to initialize our data
      await handleTransaction({ blockNumber: 0 });

      // make our observation identifiable
      mockData.totalStableDebt = ethers.BigNumber.from(9001);

      // run another block to add our observation into our dataset
      await handleTransaction({ blockNumber: 0 });

      expect(mockRollingMathFuncs.addElement).toBeCalledWith(
        new BigNumber(mockData.totalStableDebt.toHexString()),
      );

      // make another specific observation
      mockData.totalStableDebt = ethers.BigNumber.from(1337);

      // run another block to add our observation into our dataset
      await handleTransaction({ blockNumber: 0 });

      expect(mockRollingMathFuncs.addElement).toBeCalledWith(
        new BigNumber(mockData.totalStableDebt.toHexString()),
      );
    });

    it('will create a new data set if it hasn\'t seen the address before', async () => {
      // run a block to initialize our data
      await handleTransaction({ blockNumber: 0 });

      // a new dataset should have been created
      expect(mockRollingMath).toBeCalledTimes(dataFields.length);

      // make our mocked lending pool return a new address
      mockLendingPool.getReservesList.mockImplementation(jest.fn(
        () => Promise.resolve(['0xANOTHERFAKEADDRESS']),
      ));

      // run a block to initialize the new data fields
      await handleTransaction({ blockNumber: 0 });

      // a new dataset should have been created
      expect(mockRollingMath).toBeCalledTimes(dataFields.length * 2);
    });

    it('will call provider functions with correct block numbers and addresses', async () => {
      // call handle transaction with a specific block
      await handleTransaction({ blockNumber: 9001 });

      // ensure that the last calls to our mock provider have the correct block number
      expect(mockLendingPool.getReservesList).toBeCalledWith(
        { blockTag: 9001 },
      );
      expect(mockDataProvider.getReserveData).toBeCalledWith(
        '0xFAKEADDRESS', { blockTag: 9001 },
      );

      // set address returned from mock lending pool to be different
      mockLendingPool.getReservesList.mockImplementation(jest.fn(
        () => Promise.resolve(['0xANOTHERFAKEADDRESS']),
      ));

      // make another call with a new block number
      await handleTransaction({ blockNumber: 1337 });

      // ensure that the last calls to our mock provider have the correct block number
      expect(mockLendingPool.getReservesList).toBeCalledWith(
        { blockTag: 1337 },
      );
      expect(mockDataProvider.getReserveData).toBeCalledWith(
        '0xANOTHERFAKEADDRESS', { blockTag: 1337 },
      );
    });
  });

  describe('alerts when', () => {
    it('recieves an event that is outside the std limit and has adequate previous data', async () => {
      // intialize our data fields
      await handleTransaction({ blockNumber: 0 });

      // default standard deviation is 0 and average is 0, if we return anything it should alert
      mockData.totalStableDebt = ethers.BigNumber.from(9001);

      // return large amount of elements
      mockRollingMathFuncs.getNumElements.mockImplementation(
        jest.fn(() => mockConfig.minElements + 1),
      );

      const alerts = ['totalStableDebt', 'totalDebt', 'totalValueLocked'].map((field) => createAlert({
        field,
        reserve: '0xFAKEADDRESS',
        observation: '9001',
        average: '0',
      }));

      // expect findings to be equal
      expect(alerts).toStrictEqual(await handleTransaction({ blockNumber: 0 }));
    });
  });
});
