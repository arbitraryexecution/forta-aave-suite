const { createTransactionEvent } = require('forta-agent');
const axios = require('axios');
const agent = require('./new-contract-interaction');

// mock response from Etherscan API
// the 'timeStamp' field is the only one we need; all other fields have been removed
// only needs one tx record (result[0])
let mockTimestamp = 0;
const mockEtherscanResponse = {
  data: {
    status: 1,
    message: 'OK',
    result: [
      {
        timeStamp: mockTimestamp, // seconds
      },
    ],
  },
};

// mock the axios module for etherscan API calls
jest.mock('axios');
axios.get.mockResolvedValue(mockEtherscanResponse);

// mock response from ethers BaseProvider.getCode()
const mockGetCodeResponseEOA = '0x';
const mockGetCodeResponseContract = '0xabcd';

const mockEthersProvider = {
  getCode: jest.fn(),
};

/* mock tests */

describe('mock axios GET request', () => {
  it('should call axios.get and return a response', async () => {
    mockEtherscanResponse.data.result[0].timeStamp = 42;
    const response = await axios.get('https://...');
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(response.data.result[0].timeStamp).toEqual(42);

    // reset call count for next test
    axios.get.mockClear();
    expect(axios.get).toHaveBeenCalledTimes(0);
  });
});

describe('mock ethers getCode request', () => {
  it('should call getCode and return a response', async () => {
    mockEthersProvider.getCode.mockResolvedValue(mockGetCodeResponseEOA);
    const code = await mockEthersProvider.getCode();
    expect(code).toEqual('0x');
  });
});

/* agent tests */

describe('new contract interaction monitoring', () => {
  let handleTransaction = null;
  let mockData;
  let mockProtocolDataProvider;

  // pass in mockEthers as the provider for handleTransaction() to use
  beforeAll(() => {
    mockData = [
      { symbol: 'aUSDT', tokenAddress: '0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811' },
      { symbol: 'aWBTC', tokenAddress: '0x9ff58f4fFB29fA2266Ab25e75e2A8b3503311656' },
      { symbol: 'aAAVE', tokenAddress: '0xFFC97d72E13E01096502Cb8Eb52dEe56f74DAD7B' },
    ];

    mockProtocolDataProvider = {
      getAllATokens: jest.fn(() => Promise.resolve(mockData)),
    };

    handleTransaction = agent.provideHandleTransaction(
      mockEthersProvider,
      mockProtocolDataProvider,
    );
  });

  // reset function call count after each test
  afterEach(() => {
    axios.get.mockClear();
    mockEthersProvider.getCode.mockClear();
    axios.get.mockResolvedValue(mockEtherscanResponse);
  });

  describe('handleTransaction', () => {
    it('should have an Etherscan API key', () => {
      expect(process.env.ETHERSCAN_API_KEY).not.toBe(undefined);
    });

    it('returns empty findings if the LendingPool contract is not invoked', async () => {
      const txEvent = createTransactionEvent({
        transaction: {
          to: '0x1',
        },
        addresses: {
          '0x1': true,
          '0x2': true,
        },
        block: { timestamp: Date.now() / 1000 },
      });

      // run forta agent
      const findings = await handleTransaction(txEvent);

      // check assertions
      expect(axios.get).toHaveBeenCalledTimes(0);
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if the invocation is not from a contract', async () => {
      const txEvent = createTransactionEvent({
        transaction: {
          to: agent.lendingPoolAddress,
        },
        addresses: {
          [agent.lendingPoolAddress]: true,
          '0x1': true,
        },
        block: { timestamp: Date.now() / 1000 },
      });

      mockEthersProvider.getCode.mockResolvedValue(mockGetCodeResponseEOA);

      // run forta agent
      const findings = await handleTransaction(txEvent);

      // check assertions
      expect(axios.get).toHaveBeenCalledTimes(0);
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if the getCode function throws an error', async () => {
      const txEvent = createTransactionEvent({
        transaction: {
          to: agent.lendingPoolAddress,
        },
        addresses: {
          [agent.lendingPoolAddress]: true,
          '0x1': true,
        },
        block: { timestamp: Date.now() / 1000 },
      });

      // intentionally setup the getCode function to throw an error
      mockEthersProvider.getCode.mockImplementation(async () => { throw new Error('FAILED'); });

      // run forta agent
      const findings = await handleTransaction(txEvent);

      // check assertions
      expect(axios.get).toHaveBeenCalledTimes(0);
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if the etherscan api call throws an error', async () => {
      const address = '0x1';
      const now = Date.now() / 1000;

      const txEvent = createTransactionEvent({
        transaction: {
          to: agent.lendingPoolAddress,
        },
        addresses: {
          [agent.lendingPoolAddress]: true,
          [address]: true,
        },
        block: { timestamp: now },
      });

      mockEthersProvider.getCode.mockResolvedValue(mockGetCodeResponseContract);

      mockTimestamp = now - 86400 * 1; // 1 day = 86400 seconds
      mockEtherscanResponse.data.result[0].timeStamp = mockTimestamp;

      // intentionally setup the axios 'GET' request to throw an error
      axios.get.mockImplementation(async () => { throw new Error('FAILED'); });

      // run forta agent
      const findings = await handleTransaction(txEvent);

      // check assertions
      expect(axios.get).toHaveBeenCalledTimes(1); // expect 1 call for the non-aave address
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if the invocation is from an old contract', async () => {
      const now = Date.now() / 1000;
      const txEvent = createTransactionEvent({
        transaction: {
          to: agent.lendingPoolAddress,
        },
        addresses: {
          [agent.lendingPoolAddress]: true,
          '0x1': true,
        },
        block: { timestamp: now },
      });

      mockEthersProvider.getCode.mockResolvedValue(mockGetCodeResponseContract);
      mockTimestamp = now - 86400 * 7; // 1 day = 86400 seconds
      mockEtherscanResponse.data.result[0].timeStamp = mockTimestamp;

      // run forta agent
      const findings = await handleTransaction(txEvent);
      const contractAge = agent.getContractAge(now, mockTimestamp);

      // check assertions
      expect(axios.get).toHaveBeenCalledTimes(1); // expect 1 call for the non-aave address
      expect(contractAge).toEqual(7);
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if a new contract was involved in the transaction', async () => {
      const address = '0x1';
      const now = Date.now() / 1000;

      const txEvent = createTransactionEvent({
        transaction: {
          to: agent.lendingPoolAddress,
        },
        addresses: {
          [agent.lendingPoolAddress]: true,
          [address]: true,
        },
        block: { timestamp: now },
      });

      mockEthersProvider.getCode.mockResolvedValue(mockGetCodeResponseContract);

      mockTimestamp = now - 86400 * 1; // 1 day = 86400 seconds
      mockEtherscanResponse.data.result[0].timeStamp = mockTimestamp;

      // run forta agent
      const findings = await handleTransaction(txEvent);
      const contractAge = agent.getContractAge(now, mockTimestamp);

      // check assertions
      expect(axios.get).toHaveBeenCalledTimes(1); // expect 1 call for the non-aave address
      expect(contractAge).toEqual(1);
      expect(findings).toStrictEqual([agent.createAlert(address, contractAge)]);
    });
  });
});
