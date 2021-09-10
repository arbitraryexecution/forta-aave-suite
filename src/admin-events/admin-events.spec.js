const ethers = require('ethers');

const {
  TransactionEvent,
  FindingType,
  FindingSeverity,
  Finding,
} = require('forta-agent');

const { handleTransaction } = require('./admin-events');

// constants
const lendingPoolAddressProvider = '0xb53c1a33016b2dc2ff3653530bff1848a515c8c5';
const configurationAdminUpdatedTopic = '0xc20a317155a9e7d84e06b716b4b355d47742ab9f8c5d630e7f556553f582430d';

/**
 * TransactionEvent(type, network, transaction, receipt, traces, addresses, block)
 */
function createTxEvent({ hash, logs, addresses }) {
  return new TransactionEvent(null, null, { hash }, { logs }, [], addresses, null);
}

// tests
describe('admin event monitoring', () => {
  // logs data for test case: address match + topic match (should trigger a finding)
  const logsMatchEvent = [
    {
      address: lendingPoolAddressProvider,
      topics: [
        configurationAdminUpdatedTopic,
      ],
    },
  ];

  // logs data for test case: address match + no topic match
  const logsNoMatchEvent = [
    {
      address: lendingPoolAddressProvider,
      topics: [
        '0x0',
      ],
    },
  ];

  // logs data for test case:  no address match + no topic match
  const logsNoMatchAddress = [
    {
      address: ethers.constants.AddressZero,
      topics: [
        ethers.constants.HashZero,
      ],
    },
  ];

  describe('handleTransaction', () => {
    it('returns empty findings if contract address does not match', async () => {
      // build txEvent
      const txEvent = createTxEvent({
        hash: ethers.constants.HashZero,
        logs: logsNoMatchAddress,
        addresses: { [ethers.constants.AddressZero]: true },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if contract address matches but not event', async () => {
      // build tx event
      const txEvent = createTxEvent({
        hash: ethers.constants.HashZero,
        logs: logsNoMatchEvent,
        addresses: { [lendingPoolAddressProvider]: true },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if a target contract emits an event from its watchlist', async () => {
      const eventName = 'ConfigurationAdminUpdated(address)';
      const contractName = 'LendingPoolAddressesProvider';
      const contractAddress = lendingPoolAddressProvider;

      // build txEvent
      const txEvent = createTxEvent({
        hash: ethers.constants.HashZero,
        logs: logsMatchEvent,
        addresses: { [lendingPoolAddressProvider]: true },
      });

      // run agent
      const findings = await handleTransaction(txEvent);
      const { hash } = txEvent.transaction;

      // assertions
      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: 'Aave Admin Event',
          description: `The ${eventName} event was emitted by the ${contractName} contract`,
          alertId: 'AE-AAVE-ADMIN-EVENT',
          type: FindingType.Suspicious,
          severity: FindingSeverity.Low,
          metadata: {
            hash,
            contractName,
            contractAddress,
            eventName,
          },
          everestId: '0xa3d1fd85c0b62fa8bab6b818ffc96b5ec57602b6',
        }),
      ]);
    });
  });
});
