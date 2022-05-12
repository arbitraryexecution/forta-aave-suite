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

const { getAbi, calculateStatistics, parseCsvAndCompute } = require('./utils');
const config = require('../bot-config.json');

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
    expect(contracts).not.toBe({});
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
});

describe('test helper functions', () => {
  it('calculateStatistics returns the correct output given a specific input', () => {
    let result = calculateStatistics(0, 0, 0, 10);
    let expectedResult = {
      mean: 10,
      stdDev: 0,
      variance: 0,
      numDataPoints: 1,
    };
    expect(result).toStrictEqual(expectedResult);

    result = calculateStatistics(10, 0, 1, 11);
    expectedResult = {
      mean: 10.5,
      stdDev: 0.5,
      variance: 0.25,
      numDataPoints: 2,
    };
    expect(result).toStrictEqual(expectedResult);
  });

  it('parseCsvAndCompute returns the correct output given a specific input', async () => {
    const mockTokenInfo = {
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': 18,
    };
    const mockTokenPrice = {
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': 1,
    };
    const mockStream = {
      pipe: jest.fn().mockReturnThis(),
      // eslint-disable-next-line func-names
      on: jest.fn().mockImplementation(function (event, handler) {
        if (event === 'data') {
          handler({
            asset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            premium: '1000000000000000000',
          });
        } else {
          handler();
        }

        return this;
      }),
    };

    mockReadStream.mockReturnValueOnce(mockStream);
    const result = await parseCsvAndCompute('', mockTokenInfo, mockTokenPrice);
    const expectedResult = {
      mean: 1,
      stdDev: 0,
      variance: 0,
      numDataPoints: 1,
    };
    expect(result).toStrictEqual(expectedResult);
  });
});
