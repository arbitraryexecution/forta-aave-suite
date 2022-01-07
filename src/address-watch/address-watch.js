const { Finding, FindingSeverity, FindingType } = require('forta-agent');

// load config file
const addressList = require('./address-watch.json');

// load configuration data from agent config file
const { aaveEverestId: AAVE_EVEREST_ID } = require('../../agent-config.json');

// get list of addresses to watch
const addresses = Object.keys(addressList);

async function handleTransaction(txEvent) {
  const findings = [];
  const { from, hash } = txEvent.transaction;

  // check if an address in the watchlist was the initiator of the transaction
  addresses.forEach((address) => {
    if (from === address.toLowerCase()) {
      findings.push(
        Finding.fromObject({
          name: 'Aave Address Watch',
          description: `Address ${address} (${addressList[address]}) was involved in a transaction`,
          alertId: 'AE-AAVE-ADDRESS-WATCH',
          type: FindingType.Suspicious,
          severity: FindingSeverity.Low,
          metadata: {
            from,
            hash,
          },
          everestId: AAVE_EVEREST_ID,
        }),
      );
    }
  });

  return findings;
}

module.exports = {
  handleTransaction,
  addressList,
};
