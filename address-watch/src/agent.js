const { Finding, FindingSeverity, FindingType } = require('forta-agent');

// load configuration data from bot config file
const {
  developerAbbreviation: developerAbbrev,
  protocolName,
  protocolAbbrev,
  contracts,
} = require('../bot-config.json');

function createAlert(contractAddress, contractName, type, severity) {
  return Finding.fromObject({
    name: `${protocolName} Address Watch`,
    description: `Address ${contractAddress} (${contractName}) initiated a transaction`,
    alertId: `${developerAbbrev}-${protocolAbbrev}-ADDRESS-WATCH`,
    type: FindingType[type],
    severity: FindingSeverity[severity],
  });
}

async function handleTransaction(txEvent) {
  const findings = [];
  const { from } = txEvent.transaction;

  Object.entries(contracts).forEach(([contractName, values]) => {
    const {
      address,
      watch: {
        type,
        severity,
      },
    } = values;

    // check if an address in the config file was the initiator of the transaction
    if (from === address.toLowerCase()) {
      findings.push(
        createAlert(address, contractName, type, severity),
      );
    }
  });

  return findings;
}

module.exports = {
  handleTransaction,
};
