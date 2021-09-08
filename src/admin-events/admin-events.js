const { Finding, FindingSeverity, FindingType } = require('forta-agent');

// load config files
const contractAddresses = require('../../contract-addresses.json');
const adminEvents = require('./admin-events.json');

// get contract names for mapping to events
let contractNames = Object.keys(contractAddresses);

// returns the list of events for a given contract
function getEvents(contractName) {
  const events = adminEvents[contractName];
  if (events === undefined) {
    return []; // no events for this contract
  }
  return events;
}

// prune contract names that don't have any associated events
contractNames = contractNames.filter((name) => (getEvents(name).length !== 0));

async function handleTransaction(txEvent) {
  const findings = [];
  const { hash } = txEvent.transaction;

  // iterate over each contract name to get the address and events
  contractNames.forEach((contractName) => {
    // for each contract name, lookup the address
    const contractAddress = contractAddresses[contractName].toLowerCase();
    const events = getEvents(contractName);

    // for each contract address, check for event matches
    events.forEach((eventName) => {
      // console.log("DEBUG: contract=" + contractAddress + ", event=" + eventName);
      const eventLog = txEvent.filterEvent(eventName, contractAddress);
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
    });
  });

  return findings;
}

module.exports = {
  handleTransaction,
};
