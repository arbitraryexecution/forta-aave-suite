const { provideInitialize, provideHandleTransaction, provideHandleBlock } = require('./agent');

describe('agents', () => {
  let handleTransaction;
  let handleBlock;
  let initialize;

  const txHandler1 = {
    handleTransaction: jest.fn(),
    initialize: jest.fn(),
  };
  const txHandler2 = {
    handleTransaction: jest.fn(),
    initialize: {},
  };
  const txHandler3 = {
    handleTransaction: jest.fn(),
  };
  const mockTxEvent = {
    some: 'txEvent',
  };

  const blockHandler1 = {
    handleBlock: jest.fn(),
    initialize: jest.fn(),
  };
  const blockHandler2 = {
    handleBlock: jest.fn(),
    initialize: {},
  };
  const blockHandler3 = {
    handleBlock: jest.fn(),
  };
  const mockBlockEvent = {
    some: 'blockEvent',
  };

  beforeAll(() => {
    handleTransaction = provideHandleTransaction([
      txHandler1,
      txHandler2,
      txHandler3,
    ]);
    handleBlock = provideHandleBlock([
      blockHandler1,
      blockHandler2,
      blockHandler3,
    ]);
    initialize = provideInitialize([
      txHandler1,
      txHandler2,
      txHandler3,
      blockHandler1,
      blockHandler2,
      blockHandler3,
    ]);
  });

  describe('handleTransaction', () => {
    it('invokes transaction handlers 1 through 3 and returns their findings', async () => {
      const mockFinding = { some: 'finding' };
      txHandler1.handleTransaction.mockReturnValueOnce([mockFinding, mockFinding]);
      txHandler2.handleTransaction.mockReturnValueOnce([mockFinding]);
      txHandler3.handleTransaction.mockReturnValueOnce([]);

      const findings = await handleTransaction(mockTxEvent);

      expect(findings).toStrictEqual([mockFinding, mockFinding, mockFinding]);
      expect(txHandler1.handleTransaction).toHaveBeenCalledTimes(1);
      expect(txHandler1.handleTransaction).toHaveBeenCalledWith(
        mockTxEvent,
      );

      expect(txHandler2.handleTransaction).toHaveBeenCalledTimes(1);
      expect(txHandler2.handleTransaction).toHaveBeenCalledWith(
        mockTxEvent,
      );

      expect(txHandler3.handleTransaction).toHaveBeenCalledTimes(1);
      expect(txHandler3.handleTransaction).toHaveBeenCalledWith(
        mockTxEvent,
      );
    });
  });

  describe('handleBlock', () => {
    it('invokes block handlers 1 through 3 and returns their findings', async () => {
      const mockFinding = { some: 'finding' };
      blockHandler1.handleBlock.mockReturnValueOnce([mockFinding, mockFinding]);
      blockHandler2.handleBlock.mockReturnValueOnce([mockFinding]);
      blockHandler3.handleBlock.mockReturnValueOnce([]);

      const findings = await handleBlock(mockBlockEvent);

      expect(findings).toStrictEqual([mockFinding, mockFinding, mockFinding]);
      expect(blockHandler1.handleBlock).toHaveBeenCalledTimes(1);
      expect(blockHandler1.handleBlock).toHaveBeenCalledWith(
        mockBlockEvent,
      );

      expect(blockHandler2.handleBlock).toHaveBeenCalledTimes(1);
      expect(blockHandler2.handleBlock).toHaveBeenCalledWith(
        mockBlockEvent,
      );

      expect(blockHandler3.handleBlock).toHaveBeenCalledTimes(1);
      expect(blockHandler3.handleBlock).toHaveBeenCalledWith(
        mockBlockEvent,
      );
    });
  });

  describe('initialize', () => {
    it('invokes initialize function on all handlers that have valid initialize functions', async () => {
      await initialize();

      expect(txHandler1.initialize).toHaveBeenCalledTimes(1);
      expect(txHandler1.initialize).toHaveBeenCalledWith();
      expect(blockHandler1.initialize).toHaveBeenCalledTimes(1);
      expect(blockHandler1.initialize).toHaveBeenCalledWith();
    });
  });
});
