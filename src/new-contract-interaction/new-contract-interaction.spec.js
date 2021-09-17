const { TransactionEvent } = require('forta-agent');
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

  // function for creating a simulated transaction
  const createTxEvent = ({ to, addresses }) => {
    const type = null;
    const network = null;
    const transaction = {
      to,
    };
    const receipt = {};
    const traces = [];
    const block = {};
    return new TransactionEvent(type, network, transaction, receipt, traces, addresses, block);
  };

  // pass in mockEthers as the provider for handleTransaction() to use
  beforeAll(() => {
    handleTransaction = agent.provideHandleTransaction(mockEthersProvider);
  });

  // reset function call count after each test
  afterEach(() => {
    axios.get.mockClear();
  });

  describe('handleTransaction', () => {
    it('returns empty findings if the LendingPool contract is not invoked', async () => {
      const txEvent = createTxEvent({
        to: '0x1',
        addresses: {
          '0x1': true,
          '0x2': true,
        },
      });

      // run forta agent
      const findings = await handleTransaction(txEvent);

      // check assertions
      expect(axios.get).toHaveBeenCalledTimes(0);
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if the invocation is not from a contract', async () => {
      const txEvent = createTxEvent({
        to: agent.lendingPoolV2Address,
        addresses: {
          [agent.lendingPoolV2Address]: true,
          '0x1': true,
        },
      });

      mockEthersProvider.getCode.mockResolvedValue(mockGetCodeResponseEOA);

      // run forta agent
      const findings = await handleTransaction(txEvent);

      // check assertions
      expect(axios.get).toHaveBeenCalledTimes(0);
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if the invocation is from an old contract', async () => {
      const txEvent = createTxEvent({
        to: agent.lendingPoolV2Address,
        addresses: {
          [agent.lendingPoolV2Address]: true,
          '0x1': true,
        },
      });

      mockEthersProvider.getCode.mockResolvedValue(mockGetCodeResponseContract);

      const now = Date.now() / 1000;
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

      const txEvent = createTxEvent({
        to: agent.lendingPoolV2Address,
        addresses: {
          [agent.lendingPoolV2Address]: true,
          [address]: true,
        },
      });

      mockEthersProvider.getCode.mockResolvedValue(mockGetCodeResponseContract);

      const now = Date.now() / 1000;
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
