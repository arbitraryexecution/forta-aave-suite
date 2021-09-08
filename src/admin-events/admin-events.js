const { Finding, FindingSeverity, FindingType } = require('forta-agent');

// load config files
const contractAddresses = require('../../contract-addresses.json');
const adminEvents = require('./admin-events.json');

// get contract names for mapping to events
const contractNames = Object.keys(contractAddresses);

async function handleTransaction(txEvent) {
  const findings = [];
  const { hash } = txEvent.transaction;

  let contractName = '';
  let contractAddress = '';
  let events = '';
  let eventName = '';
  let eventLog = null;

  // iterate over each contract
  for (let i = 0; i < contractNames.length; i++) {
    // for each contract name, lookup the address
    contractName = contractNames[i];
    contractAddress = contractAddresses[contractName].toLowerCase();

    // for each contract address, iterate over its events
    events = adminEvents[contractName];
    if (events === undefined) continue; // no events for this contract

    for (let j = 0; j < events.length; j++) {
      eventName = events[j];
      // console.log("DEBUG: contract=" + contractAddress + ", event=" + eventName);
      eventLog = txEvent.filterEvent(eventName, contractAddress);
      if (eventLog.length !== 0) {
        findings.push(
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
        );
      }
    }
  }

  return findings;
}

module.exports = {
  handleTransaction,
};
