const mockJSON = {
  developerAbbreviation: 'TEST',
  protocolName: 'mockProtocol',
  protocolAbbrev: 'MOCK',
  contracts: {
    mockContract1: {
      address: '0x2fbb0c60a41cb7ea5323071624dcead3d213d0fa',
      watch: {
        type: 'Info',
        severity: 'Info',
      },
    },
    mockContract2: {
      address: '0xFe1A6056EE03235f30f7a48407A5673BBf25eD48',
      watch: {
        type: 'Info',
        severity: 'Info',
      },
    },
  },
};

// mock the config file loaded by the bot for testing
jest.mock('../bot-config.json', () => mockJSON);

const {
  TransactionEvent,
  FindingType,
  FindingSeverity,
  Finding,
  ethers,
} = require('forta-agent');

// local definitions
const { handleTransaction } = require('./agent');

/**
 * TransactionEvent(type, network, transaction, traces, addresses, block, logs, contractAddress)
 */
function createTxEvent(transaction) {
  return new TransactionEvent(null, null, transaction, [], [], null, [], []);
}

// tests
describe('watch admin addresses', () => {
  describe('handleTransaction', () => {
    it('returns empty findings if no address match is found', async () => {
      // build txEvent
      const txEvent = createTxEvent({
        from: ethers.constants.AddressZero,
      });

      // run bot with txEvent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if the transaction originator is on the watch list', async () => {
      const [contractName] = Object.keys(mockJSON.contracts);
      const { address } = mockJSON.contracts[contractName];
      const { type, severity } = mockJSON.contracts[contractName].watch;

      // build txEvent
      const txEvent = createTxEvent({
        from: address.toLowerCase(),
      });

      // run bot with txEvent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: `${mockJSON.protocolName} Address Watch`,
          description: `Address ${address} (${contractName}) was involved in a transaction`,
          alertId: `${mockJSON.developerAbbreviation}-${mockJSON.protocolAbbrev}-ADDRESS-WATCH`,
          type: FindingType[type],
          severity: FindingSeverity[severity],
        }),
      ]);
    });

    it('returns a finding if the transaction originator is on the watch list and contains a mix of uppercase and lowercase letters in its address', async () => {
      const contractName = Object.keys(mockJSON.contracts)[1];
      const { address } = mockJSON.contracts[contractName];
      const { type, severity } = mockJSON.contracts[contractName].watch;

      // build txEvent
      const txEvent = createTxEvent({
        from: address.toLowerCase(),
      });

      // run bot with txEvent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: `${mockJSON.protocolName} Address Watch`,
          description: `Address ${address} (${contractName}) was involved in a transaction`,
          alertId: `${mockJSON.developerAbbreviation}-${mockJSON.protocolAbbrev}-ADDRESS-WATCH`,
          type: FindingType[type],
          severity: FindingSeverity[severity],
        }),
      ]);
    });
  });
});
