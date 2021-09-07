const ethers = require('ethers');

const {
  TransactionEvent,
  FindingType,
  FindingSeverity,
  Finding,
} = require('forta-agent');

// local definitions
const { handleTransaction, addressList } = require('./address-watch');

/**
 * TransactionEvent(type, network, transaction, receipt, traces, addresses, block)
 */
function createTxEvent(transaction) {
  return new TransactionEvent(null, null, transaction, null, [], null, null);
}

// tests 
describe('watch admin addresses', () => {
  describe('handleTransaction', () => {
    it('returns empty findings if no address match is found', async () => {
      // build txEvent
      const txEvent = createTxEvent({
        from: '0xab5801a7d398351b8be11c439e05c5b3259aec9b',
        hash: ethers.constants.HashZero,
      });

      // run agent with txEvent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if the transaction originator is on the watch list', async () => {
      // build txEvent
      const txEvent = createTxEvent({
        from: '0x46bcf35d96eda5e5f6ec48c7956bb4ed9caba1f2',
        hash: ethers.constants.HashZero,
      });

      // run agent with txEvent
      const findings = await handleTransaction(txEvent);
      const { from, hash } = txEvent.transaction;

      // assertions
      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: 'Aave Address Watch',
          description: `Address ${from} (${addressList[from]}) was involved in a transaction`,
          alertId: 'AE-AAVE-ADDRESS-WATCH',
          type: FindingType.Suspicious,
          severity: FindingSeverity.Low,
          metadata: {
            from,
            hash,
          },
          everestId: '0xa3d1fd85c0b62fa8bab6b818ffc96b5ec57602b6',
        }),
      ]);
    });
  });
});
