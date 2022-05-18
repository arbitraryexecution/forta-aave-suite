const {
  TransactionEvent, FindingType, FindingSeverity, Finding, ethers,
} = require('forta-agent');

const { provideHandleTransaction, provideInitialize } = require('./agent');

// constants
const mockContractName = 'mockContract';
const mockContractAddress = ethers.utils.hexZeroPad('0x1', 20);
const mockEventName = 'mockEvent';
const mockEventSignature = 'event mockEvent()';

/**
 * TransactionEvent(type, network, transaction, traces, addresses, block, logs, contractAddress)
 */
function createTxEvent({ logs, addresses }) {
  return new TransactionEvent(null, null, null, [], [], null, logs, addresses);
}

// tests
describe('admin event monitoring', () => {
  let initializeData;
  let handleTransaction;
  const iface = new ethers.utils.Interface([mockEventSignature]);
  const mockEventFragment = iface.getEvent(mockEventName);
  const mockEventTopic = iface.getEventTopic(mockEventFragment);

  // logs data for test case: address match + topic match (should trigger a finding)
  const logsMatchEvent = [
    {
      address: mockContractAddress,
      topics: [
        mockEventTopic,
      ],
      data: '0x',
    },
  ];

  // logs data for test case: address match + no topic match
  const logsNoMatchEvent = [
    {
      address: mockContractAddress,
      topics: [
        ethers.constants.HashZero,
      ],
      data: '0x',
    },
  ];

  // logs data for test case:  no address match + no topic match
  const logsNoMatchAddress = [
    {
      address: ethers.constants.AddressZero,
      topics: [
        ethers.constants.HashZero,
      ],
      data: '0x',
    },
  ];

  beforeEach(async () => {
    initializeData = {};

    // initialize the handler
    await (provideInitialize(initializeData))();
    handleTransaction = provideHandleTransaction(initializeData);

    // modify initializeData to contain only the mock contract information for testing
    initializeData.contracts = [{
      name: mockContractName,
      address: mockContractAddress,
      iface,
      eventSignatures: [mockEventSignature],
    }];
  });

  describe('handleTransaction', () => {
    it('returns empty findings if contract address does not match', async () => {
      // build txEvent
      const txEvent = createTxEvent({
        logs: logsNoMatchAddress,
        addresses: { [ethers.constants.AddressZero]: true },
      });

      // run bot
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if contract address matches but not event', async () => {
      // build tx event
      const txEvent = createTxEvent({
        logs: logsNoMatchEvent,
        addresses: { [mockContractAddress]: true },
      });

      // run bot
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if a target contract emits an event from its watchlist', async () => {
      // build txEvent
      const txEvent = createTxEvent({
        logs: logsMatchEvent,
        addresses: { [mockContractAddress]: true },
      });

      // run bot
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: 'Aave Admin Event',
          description: `The ${mockEventName} event was emitted by the ${mockContractName} contract`,
          alertId: 'AE-AAVE-ADMIN-EVENT',
          type: FindingType.Suspicious,
          severity: FindingSeverity.Low,
          metadata: {
            contractName: mockContractName,
            contractAddress: mockContractAddress,
            eventName: mockEventName,
          },
        }),
      ]);
    });
  });
});
