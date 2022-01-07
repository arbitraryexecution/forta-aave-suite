const ethers = require('ethers');

const {
  TransactionEvent,
  FindingType,
  FindingSeverity,
  Finding,
} = require('forta-agent');

// local definitions
const { handleTransaction, addressList } = require('./agent');

// load configuration data from agent config file
const { aaveEverestId: AAVE_EVEREST_ID } = require('../agent-config.json');

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
        from: ethers.constants.AddressZero,
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
          everestId: AAVE_EVEREST_ID,
        }),
      ]);
    });

    it('returns a finding if the transaction originator is on the watch list and contains a mix of uppercase and lowercase letters in its address', async () => {
      // build txEvent
      const fromAddress = '0x504b0B9B2fa7fEb434820058061f73E7e86ed38A';
      const txEvent = createTxEvent({
        from: fromAddress.toLowerCase(),
        hash: ethers.constants.HashZero,
      });

      // run agent with txEvent
      const findings = await handleTransaction(txEvent);
      const { from, hash } = txEvent.transaction;

      // assertions
      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: 'Aave Address Watch',
          description: `Address ${fromAddress} (${addressList[fromAddress]}) was involved in a transaction`,
          alertId: 'AE-AAVE-ADDRESS-WATCH',
          type: FindingType.Suspicious,
          severity: FindingSeverity.Low,
          metadata: {
            from,
            hash,
          },
          everestId: AAVE_EVEREST_ID,
        }),
      ]);
    });
  });
});
