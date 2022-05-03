// create a mock contract that contains the methods used when initializing the bot
const mockCombinedContract = {
  getReservesList: jest.fn(),
  getReserveData: jest.fn(),
};

// create mock functions for mocking the rolling-math module
const mockNumElements = jest.fn();
const mockSum = jest.fn();
const mockAverage = jest.fn();
const mockStandardDeviation = jest.fn();
const mockAddElement = jest.fn().mockReturnValue(0);

// combine the mocked provider and contracts into the ethers import mock
jest.mock('forta-agent', () => ({
  ...jest.requireActual('forta-agent'),
  getEthersProvider: jest.fn(),
  ethers: {
    ...jest.requireActual('ethers'),
    Contract: jest.fn().mockReturnValue(mockCombinedContract),
  },
}));

// mock the rolling-math module
jest.mock('rolling-math', () => jest.fn().mockImplementation(() => ({
  getWindowSize: jest.fn().mockReturnValue(this.arg0),
  getNumElements: mockNumElements,
  getSum: mockSum,
  getAverage: mockAverage,
  getStandardDeviation: mockStandardDeviation,
  addElement: mockAddElement,
})));

const {
  Finding, FindingType, FindingSeverity, ethers,
} = require('forta-agent');
const RollingMath = require('rolling-math');
const BigNumber = require('bignumber.js');
const { provideInitialize, provideHandleBlock } = require('./agent');
const config = require('../bot-config.json');

describe('liquidity and total value locked bot tests', () => {
  // handles to things we will use during testing
  let handleBlock;
  let initializeData;
  let mockData;
  const { dataFields } = config.totalValueAndLiquidity;

  // we need to set up our testing environment for each test
  beforeEach(async () => {
    // mockData contains the observations of the fields we look for in the handler
    mockData = {};
    dataFields.forEach((field) => {
      mockData[field] = ethers.BigNumber.from(0);
    });

    initializeData = {};

    // initialize the handler
    await (provideInitialize(initializeData))();
    handleBlock = provideHandleBlock(initializeData);

    // reset contract mocks to initial values
    initializeData.lendingPoolContract.getReservesList.mockResolvedValue(['0xMOCKRESERVEADDRESS']);
    initializeData.dataProviderContract.getReserveData.mockResolvedValue(mockData);

    // clear and reset rolling-math mocks to default values
    RollingMath.mockClear();
    mockNumElements.mockReturnValue(0);
    mockSum.mockReturnValue(new BigNumber(0));
    mockAverage.mockReturnValue(new BigNumber(0));
    mockStandardDeviation.mockReturnValue(new BigNumber(0));
  });

  describe('configurations work for', () => {
    it('window size', async () => {
      // set window size to a unique and non default number
      initializeData.windowSize = 389003;

      // run a block through
      await handleBlock({ blockNumber: 0 });

      // we should have a single instance of our rolling math library for each
      // data field, all with our custom size
      expect(RollingMath).toBeCalledTimes(dataFields.length);
      expect(RollingMath).toBeCalledWith(initializeData.windowSize);
    });

    it('standard deviation limit', async () => {
      // run a block to initialize our data
      await handleBlock({ blockNumber: 0 });

      // set standard deviation limit to a unique and non default number
      initializeData.numStdDeviations = 45;

      // make our math module return more than minimum required elements
      mockNumElements.mockReturnValue(initializeData.minElements + 1);
      // make our math module return predictable values
      mockAverage.mockReturnValue(new BigNumber(10));
      mockStandardDeviation.mockReturnValue(new BigNumber(1));

      // ensure observations below standard deviation we do not alert
      mockData.totalStableDebt = ethers.BigNumber.from(initializeData.numStdDeviations * 1 + 10);

      // since we are equal to but not passing the limit we should not get back
      // any findings
      expect(await handleBlock({ blockNumber: 0 })).toStrictEqual([]);

      // make observations larger than our standard deviation limit
      mockData.totalStableDebt = ethers.BigNumber.from(initializeData.numStdDeviations * 1 + 11);

      // since we are outside of the limit, expect a finding
      expect(await handleBlock({ blockNumber: 0 })).not.toStrictEqual([]);
    });

    it('minimum elements before triggering', async () => {
      // run a block to initialize our data
      await handleBlock({ blockNumber: 0 });

      // set up our observations to be outside of standard deviation range
      // since default average and standard deviation returned is 0, any number will suffice
      mockData.totalStableDebt = ethers.BigNumber.from(100);

      // set number of required elements to an arbitrary value
      initializeData.minElements = 1879;

      // since default getNumElements returns 0, we should not expect a finding
      expect(await handleBlock({ blockNumber: 0 })).toStrictEqual([]);

      // make our math library return a larger number of elements than required
      mockNumElements.mockReturnValue(initializeData.minElements + 1);

      // now that we report a substantial number of elements, expect a finding
      expect(await handleBlock({ blockNumber: 0 })).not.toStrictEqual([]);
    });
  });

  describe('doesn\'t alert when', () => {
    it('observation isn\'t outside standard deviation limit', async () => {
      // run a block to initialize our data
      await handleBlock({ blockNumber: 0 });

      // set our standard deviation to be really large so it won't alert
      mockStandardDeviation.mockReturnValue(new BigNumber(9001));

      // set the number of elements to be sufficient
      mockNumElements.mockReturnValue(initializeData.minElements + 1);

      // set large number of standard deviations to make the limit large
      initializeData.numStdDeviations = 10;

      // expect a default finding of 0 to not be past the standard deviation
      expect(await handleBlock({ blockNumber: 0 })).toStrictEqual([]);
    });

    it('there aren\'t enough previously recorded elements', async () => {
      // run a block to initialize our data
      await handleBlock({ blockNumber: 0 });

      // set our standard deviation small so it will alert
      mockStandardDeviation.mockReturnValue(new BigNumber(1));

      // set small number of standard deviations
      initializeData.numStdDeviations = 1;

      // set finding to be outside of our standard deviation range
      // standard deviation * limit + anything to get outside the limit
      mockData.totalStableDebt = ethers.BigNumber.from(1 * 1 + 1);

      // set the number of elements to be insufficient
      mockNumElements.mockReturnValue(initializeData.minElements - 1);

      // expect no finding because insufficient number of elements
      expect(await handleBlock({ blockNumber: 0 })).toStrictEqual([]);
    });
  });

  describe('whenever you pass a block it', () => {
    it('will add the observation into the dataset', async () => {
      // run a block to initialize our data
      await handleBlock({ blockNumber: 0 });

      // make our observation identifiable
      mockData.totalStableDebt = ethers.BigNumber.from(9001);

      // run another block to add our observation into our dataset
      await handleBlock({ blockNumber: 0 });

      expect(mockAddElement).toBeCalledWith(
        new BigNumber(mockData.totalStableDebt.toHexString()),
      );

      // make another specific observation
      mockData.totalStableDebt = ethers.BigNumber.from(1337);

      // run another block to add our observation into our dataset
      await handleBlock({ blockNumber: 0 });

      expect(mockAddElement).toBeCalledWith(
        new BigNumber(mockData.totalStableDebt.toHexString()),
      );
    });

    it('will create a new data set if it hasn\'t seen the address before', async () => {
      // run a block to initialize our data
      await handleBlock({ blockNumber: 0 });

      // a new dataset should have been created
      expect(RollingMath).toBeCalledTimes(dataFields.length);

      // make our mocked lending pool return an additional address
      initializeData.lendingPoolContract.getReservesList.mockResolvedValue(
        ['0xMOCKRESERVEADDRESS', '0xANOTHERFAKEADDRESS'],
      );

      // run a block to initialize the new data fields
      await handleBlock({ blockNumber: 0 });

      // a new dataset should have been created
      expect(RollingMath).toBeCalledTimes(dataFields.length * 2);
    });

    it('will call provider functions with correct block numbers and addresses', async () => {
      // call handle transaction with a specific block
      await handleBlock({ blockNumber: 9001 });

      // ensure that the last calls to our mock provider have the correct block number
      expect(initializeData.lendingPoolContract.getReservesList).toBeCalledWith(
        { blockTag: 9001 },
      );
      expect(initializeData.dataProviderContract.getReserveData).toBeCalledWith(
        '0xMOCKRESERVEADDRESS', { blockTag: 9001 },
      );

      // set address returned from mock lending pool to be different
      initializeData.lendingPoolContract.getReservesList.mockResolvedValue(['0xANOTHERFAKEADDRESS']);

      // make another call with a new block number
      await handleBlock({ blockNumber: 1337 });

      // ensure that the last calls to our mock provider have the correct block number
      expect(initializeData.lendingPoolContract.getReservesList).toBeCalledWith(
        { blockTag: 1337 },
      );
      expect(initializeData.dataProviderContract.getReserveData).toBeCalledWith(
        '0xANOTHERFAKEADDRESS', { blockTag: 1337 },
      );
    });
  });

  describe('alerts when', () => {
    it('recieves an event that is outside the std limit and has adequate previous data', async () => {
      // intialize our data fields
      await handleBlock({ blockNumber: 0 });

      // default standard deviation is 0 and average is 0, if we return anything it should alert
      mockData.totalStableDebt = ethers.BigNumber.from(9001);

      // return large amount of elements
      mockNumElements.mockReturnValue(initializeData.minElements + 1);

      const alerts = ['totalStableDebt', 'totalDebt', 'totalValueLocked'].map((field) => Finding.fromObject({
        name: `Anomalous Aave ${field} change`,
        description: `Reserve 0xMOCKRESERVEADDRESS had a large change in ${field}`,
        alertId: 'AE-AAVE-TVL',
        severity: FindingSeverity.High,
        type: FindingType.Suspicious,
        metadata: {
          field,
          reserve: '0xMOCKRESERVEADDRESS',
          observation: '9001',
          average: '0',
        },
      }));

      // expect findings to be equal
      expect(alerts).toStrictEqual(await handleBlock({ blockNumber: 0 }));
    });
  });
});
