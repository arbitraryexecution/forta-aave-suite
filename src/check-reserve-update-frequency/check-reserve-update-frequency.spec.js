// required libraries
const BigNumber = require('bignumber.js');
const {
  Finding,
  FindingSeverity,
  FindingType,
  createBlockEvent,
} = require('forta-agent');
const { provideHandleBlock, teardownProvider } = require('./check-reserve-update-frequency');

describe('AAVE reserve price oracle agent', () => {
  let handleBlock;

  afterEach(() => {
    teardownProvider();
  });

  // this function allows us to mock the behavior of the initializeTokensContracts function
  // in production, that function:
  //   - gets an Array of reserve token addresses from the Protocol Data Provider contract
  //   - gets the Price Oracle address from the  Lending Pool Address Provider contract
  //   - gets the Price Source address for each reserve token address
  //   - gets the Price Source contract for each reserve token address
  //   - returns an Array of Tuples, where each Tuple has the form:
  //     (reserve token address, price source contract address, price source contract ethers object)
  function mockTokensAddressesContractPromise(mockTimestamp) {
    // create an array of reserve tokens
    const reserveTokens = [
      { symbol: 'FAKE1', tokenAddress: '0xFIRSTFAKETOKENADDRESS' },
    ];

    // create an array of contract addresses that correspond to the reserve tokens
    const contractAddresses = [
      '0xFIRSTFAKECONTRACTADDRESS',
    ];

    // create the Array of Tuples of token addresses / contract addresses / contract objects
    // pass our mockTimestamp in to the mocked return value (roundData.updatedAt) to facilitate
    // testing against different timestamp conditions
    const tokenAddressesContractTuples = reserveTokens.map((token, index) => {
      const address = contractAddresses[index];
      // need to create mock contract that has .latestRoundData method and returns roundData
      const contract = {
        latestRoundData: jest.fn(() => Promise.resolve({
          updatedAt: new BigNumber(mockTimestamp),
        })),
      };
      return [token, address, contract];
    });

    // wrap the Array of Tuples in a Promise (which we will resolve immediately)
    // the original function returns a Promise that is resolved when all contract interactions have
    // finished
    return Promise.resolve(tokenAddressesContractTuples);
  }

  describe('Reserve Price Oracle Monitoring', () => {
    it('returns findings if price oracle age is more than 24 hours old', async () => {
      // create a block timestamp and updatedAt timestamp that will trigger an alert
      const blockTimestamp = new BigNumber(1234567890);
      const oracleAgeTooOld = new BigNumber((24 * 60 * 60) + 1);
      const updatedAtTimestamp = blockTimestamp.minus(oracleAgeTooOld);

      // need to create blockEvent (with .block.timestamp and .blockNumber)
      const mockedBlockEvent = createBlockEvent({
        blockNumber: 12345,
        block: {
          timestamp: blockTimestamp,
        },
      });

      // create the mocked promise to pass in to provideHandleBlock
      const promise = await mockTokensAddressesContractPromise(updatedAtTimestamp);

      // create the block handler
      handleBlock = provideHandleBlock(promise);

      // create expected finding
      const token = promise[0][0];
      const priceSourceAddress = promise[0][1];
      const expectedFinding = Finding.fromObject({
        name: `Stale AAVE Price Oracle Data for ${token.symbol}`,
        description:
        `Token ${token.symbol} Price Oracle Age: ${oracleAgeTooOld.toString()} seconds`,
        alertId: 'AE-AAVE-PRICE-ORACLE-STALE',
        severity: FindingSeverity.Medium,
        type: FindingType.Suspicious,
        everestId: '0xa3d1fd85c0b62fa8bab6b818ffc96b5ec57602b6',
        metadata: {
          symbol: token.symbol,
          tokenAddress: token.tokenAddress,
          oracleAge: oracleAgeTooOld,
          priceSourceAddress,
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
        block: {
          timestamp: blockTimestamp,
        },
      });

      // create the mocked promise to pass in to provideHandleBlock
      const promise = await mockTokensAddressesContractPromise(updatedAtTimestamp);

      // create the block handler
      handleBlock = provideHandleBlock(promise);

      // we expect not to trigger an alert based on the oracle being updated less than 24 hours ago
      expect(await handleBlock(mockedBlockEvent)).toStrictEqual([]);
    });
  });
});
