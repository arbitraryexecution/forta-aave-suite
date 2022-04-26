// create mock initialize values
const mockReserveToken = { symbol: 'FAKE1', tokenAddress: '0xFIRSTFAKETOKENADDRESS' };
const mockOracleAddress = '0xMOCKORACLEADDRESS';
const mockAssetSourceAddress = '0xMOCKASSETSOURCEADDRESS';

// create a mock contract that contains the methods used when initializing the bot
const mockCombinedContract = {
  getAllReservesTokens: jest.fn().mockResolvedValue([mockReserveToken]),
  getPriceOracle: jest.fn().mockResolvedValue(mockOracleAddress),
  getSourceOfAsset: jest.fn().mockResolvedValue(mockAssetSourceAddress),
  latestRoundData: jest.fn(),
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

// required libraries
const {
  BlockEvent, FindingType, FindingSeverity, Finding,
} = require('forta-agent');
const BigNumber = require('bignumber.js');
const { provideInitialize, provideHandleBlock } = require('./agent');

function createBlockEvent(block) {
  return new BlockEvent(0, 1, block);
}

describe('AAVE reserve price oracle agent', () => {
  let initializeData;
  let handleBlock;

  beforeEach(async () => {
    initializeData = {};

    // initialize the handler
    await (provideInitialize(initializeData))();
    handleBlock = provideHandleBlock(initializeData);

    initializeData.tokenAddressContractTuples[0].priceSourceContract.latestRoundData.mockClear();
  });

  describe('Reserve Price Oracle Monitoring', () => {
    it('returns findings if price oracle age is more than 24 hours old', async () => {
      // create a block timestamp and updatedAt timestamp that will trigger an alert
      const blockTimestamp = new BigNumber(1234567890);
      const oracleAgeTooOld = new BigNumber((24 * 60 * 60) + 1);
      const updatedAtTimestamp = blockTimestamp.minus(oracleAgeTooOld);

      // need to create blockEvent (with .block.timestamp and .blockNumber)
      const mockedBlockEvent = createBlockEvent({
        blockNumber: 12345,
        timestamp: blockTimestamp,
      });

      // update the mocked latestRoundData contract function to return updatedAtTimestamp
      initializeData.tokenAddressContractTuples[0].priceSourceContract.latestRoundData
        .mockResolvedValue({ updatedAt: updatedAtTimestamp });

      // create expected finding
      const expectedFinding = Finding.fromObject({
        name: `Aave Stale Price Oracle Data for ${mockReserveToken.symbol}`,
        description: `Token ${mockReserveToken.symbol} Price Oracle Age: ${oracleAgeTooOld} seconds`,
        alertId: 'AE-AAVE-PRICE-ORACLE-STALE',
        severity: FindingSeverity.Medium,
        type: FindingType.Degraded,
        metadata: {
          symbol: mockReserveToken.symbol,
          tokenAddress: mockReserveToken.tokenAddress,
          oracleAge: oracleAgeTooOld,
          priceSourceAddress: mockAssetSourceAddress,
        },
      });

      // we expect to trigger an alert based on the oracle being one second too old (24 hr + 1 sec)
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([expectedFinding]);
    });

    it('returns no findings if price oracle age is less than 24 hours old', async () => {
      // create a block timestamp and updatedAt timestamp that will trigger an alert
      const blockTimestamp = new BigNumber(1234567890);
      const oracleAgeOkay = new BigNumber((24 * 60 * 60) - 1);
      const updatedAtTimestamp = blockTimestamp.minus(oracleAgeOkay);

      // need to create blockEvent (with .block.timestamp and .blockNumber)
      const mockedBlockEvent = createBlockEvent({
        blockNumber: 12345,
        timestamp: blockTimestamp,
      });

      // update the mocked latestRoundData contract function to return updatedAtTimestamp
      initializeData.tokenAddressContractTuples[0].priceSourceContract.latestRoundData
        .mockResolvedValue({ updatedAt: updatedAtTimestamp });

      // we expect not to trigger an alert based on the oracle being updated less than 24 hours ago
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([]);
    });
  });
});
