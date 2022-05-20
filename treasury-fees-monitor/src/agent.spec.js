const mockContract = {};
const mockReadStream = jest.fn();

jest.mock('forta-agent', () => ({
  ...jest.requireActual('forta-agent'),
  getEthersProvider: jest.fn(),
  ethers: {
    ...jest.requireActual('ethers'),
    Contract: jest.fn().mockReturnValue(mockContract),
  },
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: mockReadStream,
}));

const {
  Finding, FindingType, FindingSeverity, ethers, TransactionEvent,
} = require('forta-agent');
const BigNumber = require('bignumber.js');

const { provideHandleTransaction, provideInitialize } = require('./agent');
const {
  getObjectsFromAbi,
  createMockEventLogs,
} = require('./test-utils');
const { getAbi, calculateStatistics, parseCsvAndCompute } = require('./utils');
const config = require('../bot-config.json');

// setup mock fs streaming object
const mockAssetToken = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const mockStream = {
  pipe: jest.fn().mockReturnThis(),
  // eslint-disable-next-line func-names
  on: jest.fn().mockImplementation(function (event, handler) {
    if (event === 'data') {
      handler({
        asset: mockAssetToken,
        premium: '1000000000000000000',
      });
    } else {
      handler();
    }

    return this;
  }),
};

// utility function specific for this test module
// we are intentionally not using the Forta SDK function due to issues with
// jest mocking the module and interfering with default function values
function createTransactionEvent(txObject) {
  const txEvent = new TransactionEvent(
    null,
    null,
    null,
    [],
    {},
    null,
    txObject.logs,
    null,
  );
  return txEvent;
}

// check the configuration file to verify the values
describe('check bot configuration file', () => {
  it('protocolName key required', () => {
    const { protocolName } = config;
    expect(typeof (protocolName)).toBe('string');
    expect(protocolName).not.toBe('');
  });

  it('protocolAbbreviation key required', () => {
    const { protocolAbbreviation } = config;
    expect(typeof (protocolAbbreviation)).toBe('string');
    expect(protocolAbbreviation).not.toBe('');
  });

  it('developerAbbreviation key required', () => {
    const { developerAbbreviation } = config;
    expect(typeof (developerAbbreviation)).toBe('string');
    expect(developerAbbreviation).not.toBe('');
  });

  it('contracts key required', () => {
    const { contracts } = config;
    expect(typeof (contracts)).toBe('object');
    expect(Object.keys(contracts).length).not.toBe(0);
  });

  it('contracts key values must be valid', () => {
    const { contracts } = config;
    Object.keys(contracts).forEach((key) => {
      const { address, abiFile } = contracts[key];

      // only check that an address exists for the LendingPoolAddressesProvider entry
      if (key !== 'PriceOracle' && key !== 'LendingPool') {
        expect(address).not.toBe(undefined);

        // check that the address is a valid address
        expect(ethers.utils.isHexString(address, 20)).toBe(true);
      }

      // load the ABI from the specified file
      // the call to getAbi will fail if the file does not exist
      getAbi(abiFile);
    });
  });

  it('type and severity key required', () => {
    const { thresholds } = config;
    Object.keys(thresholds).forEach((key) => {
      const { type, severity } = thresholds[key];

      // check type, this will fail if 'type' is not valid
      expect(Object.prototype.hasOwnProperty.call(FindingType, type)).toBe(true);

      // check severity, this will fail if 'severity' is not valid
      expect(Object.prototype.hasOwnProperty.call(FindingSeverity, severity)).toBe(true);
    });
  });
});

describe('test helper functions', () => {
  it('calculateStatistics returns the correct output given a specific input', () => {
    let result = calculateStatistics(
      new BigNumber(0), new BigNumber(0), BigNumber(0), BigNumber(10),
    );
    let expectedResult = {
      mean: new BigNumber(10),
      stdDev: new BigNumber(0),
      variance: new BigNumber(0),
      numDataPoints: new BigNumber(1),
    };
    expect(result).toStrictEqual(expectedResult);

    result = calculateStatistics(
      new BigNumber(10), new BigNumber(0), new BigNumber(1), new BigNumber(11),
    );
    expectedResult = {
      mean: new BigNumber(10.5),
      stdDev: new BigNumber(0.5),
      variance: new BigNumber(0.25),
      numDataPoints: new BigNumber(2),
    };
    expect(result).toStrictEqual(expectedResult);
  });

  it('parseCsvAndCompute returns the correct output given a specific input', async () => {
    const mockTokenInfo = {
      [mockAssetToken]: 18,
    };
    const mockTokenPrice = {
      [mockAssetToken]: 1,
    };

    mockReadStream.mockReturnValueOnce(mockStream);
    const result = await parseCsvAndCompute('', mockTokenInfo, mockTokenPrice);
    const expectedResult = {
      mean: new BigNumber(1),
      stdDev: new BigNumber(0),
      variance: new BigNumber(0),
      numDataPoints: new BigNumber(1),
    };
    expect(result).toStrictEqual(expectedResult);
  });
});

describe('monitor treasury fee premiums from flash loan events', () => {
  describe('handleTransaction', () => {
    let initializeData;
    let handleTransaction;
    let mockTxEvent;

    const { abiFile } = config.contracts.LendingPool;
    const { FlashLoan: flashLoanObject } = getObjectsFromAbi(getAbi(abiFile), 'event');
    const iface = new ethers.utils.Interface([flashLoanObject]);

    beforeEach(async () => {
      initializeData = {};

      // setup the mocking needed in the initialize function
      mockReadStream.mockReturnValueOnce(mockStream);
      mockContract.getLendingPool = jest.fn().mockResolvedValueOnce('0xMOCKLENDINGPOOLADDRESS');
      mockContract.getAllReservesTokens = jest.fn().mockResolvedValueOnce([['TEST', mockAssetToken]]);
      mockContract.decimals = jest.fn().mockResolvedValueOnce(ethers.BigNumber.from(18));
      mockContract.getPriceOracle = jest.fn().mockResolvedValueOnce('0xMOCKPRICEORACLE');
      mockContract.getAssetsPrices = jest.fn().mockResolvedValueOnce(
        [ethers.BigNumber.from('1000000000000000000')],
      );

      // initialize the handler
      await provideInitialize(initializeData)();
      handleTransaction = provideHandleTransaction(initializeData);

      // initialize mock transaction event with default values
      mockTxEvent = createTransactionEvent({
        logs: [],
      });
    });

    it('returns empty findings when a FlashLoan event was not emitted', async () => {
      const findings = await handleTransaction(mockTxEvent);
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings when a FlashLoan event was emitted but the contract address does not match', async () => {
      // encode event data
      const { mockTopics, data } = createMockEventLogs(flashLoanObject, iface);

      const mockEvent = {
        address: ethers.constants.AddressZero,
        topics: mockTopics,
        data,
      };
      mockTxEvent.logs.push(mockEvent);

      const findings = await handleTransaction(mockTxEvent);
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings when the contract address matches but a FlashLoan event was not emitted', async () => {
      const mockEvent = {
        address: '0xMOCKLENDINGPOOLADDRESS',
        topics: [ethers.constants.HashZero],
        data: '0x',
      };
      mockTxEvent.logs.push(mockEvent);

      const findings = await handleTransaction(mockTxEvent);
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings when a FlashLoan event was emitted with the correct contract address but the premium is within the thresholds', async () => {
      // set the values for the statistics stored in initializeData
      initializeData.mean = new BigNumber(0);
      initializeData.stdDev = new BigNumber(0);
      initializeData.variance = new BigNumber(0);
      initializeData.numDataPoints = new BigNumber(1);

      // encode event data
      // since we do not want to generate a finding, set the premium to 0
      const overrides = {
        asset: mockAssetToken,
        premium: ethers.BigNumber.from(0),
      };
      const { mockTopics, data } = createMockEventLogs(flashLoanObject, iface, overrides);

      const mockEvent = {
        address: '0xMOCKLENDINGPOOLADDRESS',
        topics: mockTopics,
        data,
      };
      mockTxEvent.logs.push(mockEvent);

      // mock out the price oracle call
      mockContract.getAssetPrice = jest.fn()
        .mockResolvedValueOnce(ethers.BigNumber.from('1000000000000000000'));

      const findings = await handleTransaction(mockTxEvent);
      expect(findings).toStrictEqual([]);
      expect(initializeData.mean.toString()).toBe('0');
      expect(initializeData.numDataPoints.toString()).toBe('2');
      expect(initializeData.stdDev.toString()).toBe('0');
      expect(initializeData.variance.toString()).toBe('0');
    });

    it('returns a finding when a FlashLoan event was emitted with the correct contract address and the premium is greater than the low threshold', async () => {
      // set the values for the statistics stored in initializeData
      initializeData.mean = new BigNumber(0.5);
      initializeData.stdDev = new BigNumber(0.5);
      initializeData.variance = new BigNumber(0.25);
      initializeData.numDataPoints = new BigNumber(2);

      // since we want to generate a finding using the type and severity of the low threshold, parse
      // the low threshold minEth value from the config and add one
      const valueToEncode = parseInt(config.thresholds.lowThreshold.minEth, 10) + 1;
      const numerator = ethers.BigNumber.from(10).pow(18);
      const scaledValueToEncode = ethers.BigNumber.from(valueToEncode).mul(numerator);

      // encode event data
      const overrides = {
        asset: mockAssetToken,
        premium: scaledValueToEncode,
      };
      const { mockTopics, data } = createMockEventLogs(flashLoanObject, iface, overrides);

      const mockEvent = {
        address: '0xMOCKLENDINGPOOLADDRESS',
        topics: mockTopics,
        data,
      };
      mockTxEvent.logs.push(mockEvent);

      // mock out the price oracle call
      mockContract.getAssetPrice = jest.fn()
        .mockResolvedValueOnce(ethers.BigNumber.from('1000000000000000000'));

      const findings = await handleTransaction(mockTxEvent);
      const { type, severity } = config.thresholds.lowThreshold;
      const expectedFinding = Finding.fromObject({
        name: 'Aave Treasury Fee Monitor',
        description: 'An anomalous flash loan premium of 2 ETH was paid to the treasury',
        alertId: 'AE-AAVE-TREASURY-FEE',
        type: FindingType[type],
        severity: FindingSeverity[severity],
        protocol: 'Aave',
        metadata: {
          tokenAsset: mockAssetToken,
          tokenPriceEth: '1',
          premiumEth: '2',
        },
        addresses: [],
      });
      expect(findings).toStrictEqual([expectedFinding]);
    });

    it('returns a finding when a FlashLoan event was emitted with the correct contract address and the premium is greater than the high threshold', async () => {
      // set the values for the statistics stored in initializeData
      initializeData.mean = new BigNumber(0.5);
      initializeData.stdDev = new BigNumber(0.5);
      initializeData.variance = new BigNumber(0.25);
      initializeData.numDataPoints = new BigNumber(2);

      // encode event data
      const overrides = {
        asset: mockAssetToken,
        premium: ethers.BigNumber.from('1000000000000000000000'),
      };
      const { mockTopics, data } = createMockEventLogs(flashLoanObject, iface, overrides);

      const mockEvent = {
        address: '0xMOCKLENDINGPOOLADDRESS',
        topics: mockTopics,
        data,
      };
      mockTxEvent.logs.push(mockEvent);

      // mock out the price oracle call
      mockContract.getAssetPrice = jest.fn()
        .mockResolvedValueOnce(ethers.BigNumber.from('1000000000000000000'));

      const findings = await handleTransaction(mockTxEvent);
      const { type, severity } = config.thresholds.highThreshold;
      const expectedFinding = Finding.fromObject({
        name: 'Aave Treasury Fee Monitor',
        description: 'An anomalous flash loan premium of 1000 ETH was paid to the treasury',
        alertId: 'AE-AAVE-TREASURY-FEE',
        type: FindingType[type],
        severity: FindingSeverity[severity],
        protocol: 'Aave',
        metadata: {
          tokenAsset: mockAssetToken,
          tokenPriceEth: '1',
          premiumEth: '1000',
        },
        addresses: [],
      });
      expect(findings).toStrictEqual([expectedFinding]);
    });
  });
});
