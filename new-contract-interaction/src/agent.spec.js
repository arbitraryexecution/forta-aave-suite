const mockEthersProvider = {
  getCode: jest.fn(),
  getTransactionCount: jest.fn(),
};

jest.mock('forta-agent', () => ({
  ...jest.requireActual('forta-agent'),
  getEthersProvider: jest.fn().mockReturnValue(mockEthersProvider),
}));

const { TransactionEvent } = require('forta-agent');
const {
  provideInitialize,
  provideHandleTransaction,
  createEOAInteractionAlert,
  createContractInteractionAlert,
} = require('./agent');

// mock response from ethers BaseProvider.getCode()
const mockGetCodeResponseEOA = '0x';
const mockGetCodeResponseNewContract = '0x';
const mockGetCodeResponseContract = '0xabcd';

const filteredAddress = `0x3${'0'.repeat(39)}`;

const config = require('../bot-config.json');

// pull the contract to test from the config file
const [testContract] = Object.keys(config.contracts);
const { address: testContractAddress } = config.contracts[testContract].newContractEOA;

// utility function specific for this test module
// we are intentionally not using the Forta SDK function due to issues with
// jest mocking the module and interfering with default function values
function createTransactionEvent(txObject) {
  const txEvent = new TransactionEvent(
    null,
    null,
    txObject.transaction,
    [],
    txObject.addresses,
    txObject.block,
    [],
    null,
  );
  return txEvent;
}

/* mock tests */
describe('mock ethers getCode request', () => {
  it('should call getCode and return a response', async () => {
    mockEthersProvider.getCode.mockResolvedValue(mockGetCodeResponseEOA);
    const code = await mockEthersProvider.getCode();
    expect(code).toEqual('0x');
  });
});

/* agent tests */
describe('new contract interaction monitoring', () => {
  let initializeData;
  let handleTransaction;

  // pass in mockEthers as the provider for handleTransaction() to use
  beforeEach(async () => {
    initializeData = {};
    await (provideInitialize(initializeData))();
    handleTransaction = provideHandleTransaction(initializeData);
  });

  // reset function call count after each test
  afterEach(() => {
    mockEthersProvider.getCode.mockClear();
    mockEthersProvider.getTransactionCount.mockClear();
  });

  describe('handleTransaction', () => {
    it('returns empty findings if no contracts are invoked', async () => {
      const txEvent = createTransactionEvent({
        transaction: {
          to: '0x1',
        },
        addresses: {
          '0x1': true,
          '0x2': true,
        },
        block: { number: 10 },
      });

      // run forta agent
      const findings = await handleTransaction(txEvent);

      // check assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if the getCode function throws an error', async () => {
      const transactionAddress = '0x1';

      const txEvent = createTransactionEvent({
        transaction: {
          to: testContractAddress,
        },
        addresses: {
          [testContractAddress]: true,
          [transactionAddress]: true,
        },
        block: { number: 10 },
      });

      // intentionally setup the getCode function to throw an error
      mockEthersProvider.getCode.mockImplementation(async () => { throw new Error('FAILED'); });

      // run forta agent
      const findings = await handleTransaction(txEvent);

      // check assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if the invocation is from an old contract', async () => {
      const transactionAddress = '0x1';

      const txEvent = createTransactionEvent({
        transaction: {
          to: testContractAddress,
        },
        addresses: {
          [testContractAddress]: true,
          [transactionAddress]: true,
        },
        block: { number: 1 },
      });

      mockEthersProvider.getCode.mockReturnValueOnce(mockGetCodeResponseContract);
      mockEthersProvider.getCode.mockReturnValueOnce(mockGetCodeResponseContract);

      // run forta agent
      const findings = await handleTransaction(txEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if the invocation is from a filtered address', async () => {
      const transactionAddress = filteredAddress;

      const txEvent = createTransactionEvent({
        transaction: {
          to: testContractAddress,
        },
        addresses: {
          [testContractAddress]: true,
          [transactionAddress]: true,
        },
        block: { number: 10 },
      });

      // run forta agent
      const findings = await handleTransaction(txEvent);

      // check assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if a new contract was involved in the transaction', async () => {
      const transactionAddress = '0x1';
      const blockNumber = 10;

      const txEvent = createTransactionEvent({
        transaction: {
          to: testContractAddress,
        },
        addresses: {
          [testContractAddress]: true,
          [transactionAddress]: true,
        },
        block: { number: blockNumber },
      });

      mockEthersProvider.getCode.mockResolvedValueOnce(mockGetCodeResponseContract);
      mockEthersProvider.getCode.mockResolvedValueOnce(mockGetCodeResponseNewContract);

      // run forta agent
      const findings = await handleTransaction(txEvent);

      const expectedFindings = [];
      initializeData.contracts.forEach((contract) => {
        const {
          name,
          address,
          findingType,
          findingSeverity,
        } = contract;

        expectedFindings.push(createContractInteractionAlert(
          name,
          address,
          transactionAddress,
          findingType,
          findingSeverity,
          initializeData.protocolName,
          initializeData.protocolAbbreviation,
          initializeData.developerAbbreviation,
        ));
      });

      expect(findings).toStrictEqual(expectedFindings);
    });

    it('returns empty findings if the invocation is from an old EOA', async () => {
      const transactionAddress = '0x1';

      const txEvent = createTransactionEvent({
        transaction: {
          to: testContractAddress,
        },
        addresses: {
          [testContractAddress]: true,
          [transactionAddress]: true,
        },
        block: { number: 10 },
      });

      mockEthersProvider.getCode.mockResolvedValue(mockGetCodeResponseEOA);
      mockEthersProvider.getTransactionCount.mockResolvedValue(10);

      // run forta agent
      const findings = await handleTransaction(txEvent);

      // check assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if a new EOA was involved in the transaction', async () => {
      const transactionAddress = '0x1';

      const txEvent = createTransactionEvent({
        transaction: {
          to: testContractAddress,
        },
        addresses: {
          [testContractAddress]: true,
          [transactionAddress]: true,
        },
        block: { number: 10 },
      });

      const transactionCount = 1;

      mockEthersProvider.getCode.mockResolvedValue(mockGetCodeResponseEOA);
      mockEthersProvider.getTransactionCount.mockResolvedValue(transactionCount);

      // run forta agent
      const findings = await handleTransaction(txEvent);

      // check assertions
      const expectedFindings = [];
      initializeData.contracts.forEach((contract) => {
        const {
          name,
          address,
          findingType,
          findingSeverity,
        } = contract;

        expectedFindings.push(createEOAInteractionAlert(
          name,
          address,
          transactionAddress,
          transactionCount,
          findingType,
          findingSeverity,
          initializeData.protocolName,
          initializeData.protocolAbbreviation,
          initializeData.developerAbbreviation,
        ));
      });

      expect(findings).toStrictEqual(expectedFindings);
    });
  });
});
