const mockContract = {};

jest.mock('forta-agent', () => ({
  ...jest.requireActual('forta-agent'),
  getEthersProvider: jest.fn(),
  ethers: {
    ...jest.requireActual('ethers'),
    Contract: jest.fn().mockReturnValue(mockContract),
  },
}));

const {
  Finding, FindingType, FindingSeverity, ethers,
} = require('forta-agent');

const { provideInitialize, provideHandleBlock } = require('./agent');
const { getAbi } = require('./utils');
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

      expect(address).not.toBe(undefined);
      // check that the address is a valid address
      expect(ethers.utils.isHexString(address, 20)).toBe(true);

      // load the ABI from the specified file
      // the call to getAbi will fail if the file does not exist
      getAbi(abiFile);
    });
  });

  it('ratioSettings values must be valid', () => {
    const { ratioSettings } = config;
    const { maxUtilizationRate, type, severity } = ratioSettings;

    // check that maxUtilizationRate is of type 'number'
    expect(typeof (maxUtilizationRate)).toBe('number');

    // check type, this will fail if 'type' is not valid
    expect(Object.prototype.hasOwnProperty.call(FindingType, type)).toBe(true);

    // check severity, this will fail if 'severity' is not valid
    expect(Object.prototype.hasOwnProperty.call(FindingSeverity, severity)).toBe(true);
  });
});

describe('monitor borrow to collateral ratio', () => {
  describe('handleBlock', () => {
    let initializeData;
    let handleBlock;
    const mockSymbol = 'TEST';
    const mockAssetTokenAddress = '0xMOCKASSETTOKEN';

    beforeEach(async () => {
      initializeData = {};

      const mockReturnValue = [mockSymbol, mockAssetTokenAddress];
      mockReturnValue.symbol = mockSymbol;
      mockReturnValue.tokenAddress = mockAssetTokenAddress;

      // setup the mocking needed in the initialize function
      mockContract.getAllReservesTokens = jest.fn().mockResolvedValueOnce([mockReturnValue]);
      mockContract.decimals = jest.fn().mockResolvedValueOnce(ethers.BigNumber.from(1));

      // initialize the handler
      await (provideInitialize(initializeData))();
      handleBlock = provideHandleBlock(initializeData);
    });

    it('returns no findings when the collateral to borrow ratio of an asset is less than the maxUtilizationRate', async () => {
      // explicitly set the maxUtilizationRate
      initializeData.maxUtilizationRate = 99;

      // setup the mock return values for getting the reserve data, since we do not want to generate
      // a finding, make sure (totalBorrows / totalLiquidity) * 100 < maxUtilizationRate
      const availableLiquidity = ethers.BigNumber.from(80);
      const totalStableDebt = ethers.BigNumber.from(10);
      const totalVariableDebt = ethers.BigNumber.from(10);
      initializeData.protocolDataProviderContract.getReserveData = jest.fn().mockResolvedValueOnce({
        availableLiquidity,
        totalStableDebt,
        totalVariableDebt,
      });

      const findings = await handleBlock();
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding when the collateral to borrow ratio of an asset is greater than the maxUtilizationRate', async () => {
      // explicitly set the maxUtilizationRate, type, and severity
      initializeData.maxUtilizationRate = 90;
      initializeData.type = 'Info';
      initializeData.severity = 'Info';

      // setup the mock return values for getting the reserve data, since we do want to generate a
      // finding, make sure (totalBorrows / totalLiquidity) * 100 > maxUtilizationRate
      const availableLiquidity = ethers.BigNumber.from(0);
      const totalStableDebt = ethers.BigNumber.from(10);
      const totalVariableDebt = ethers.BigNumber.from(0);
      initializeData.protocolDataProviderContract.getReserveData = jest.fn().mockResolvedValueOnce({
        availableLiquidity,
        totalStableDebt,
        totalVariableDebt,
      });

      const findings = await handleBlock();
      const expectedFinding = Finding.fromObject({
        name: 'Aave Borrow Collateral Ratio',
        description: 'The ratio of total borrow amount to total liquidity exceeds the configured '
          + `threshold of 90% for asset ${mockAssetTokenAddress} (${mockSymbol})`,
        alertId: 'AE-AAVE-BORROW-COLLATERAL-RATIO',
        type: FindingType.Info,
        severity: FindingSeverity.Info,
        protocol: 'Aave',
        metadata: {
          assetTokenSymbol: mockSymbol,
          assetTokenAddress: mockAssetTokenAddress,
          availableLiquidity: '0',
          totalLiquidity: '1',
          totalStableDebt: '1',
          totalVariableDebt: '0',
          currUtilizationRate: '100.00',
          maxUtilizationRate: '90',
        },
      });
      expect(findings).toStrictEqual([expectedFinding]);
    });
  });
});
