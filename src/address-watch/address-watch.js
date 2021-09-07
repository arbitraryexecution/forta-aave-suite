const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const path = require('path');

// load config file
const addressList = require('./address-watch.json');

// get list of addresses to watch
const addresses = (Object.keys(addressList)).map(function (a) {
  return a.toLowerCase();
});

async function handleTransaction(txEvent) {
  const findings = [];
  const { from, hash } = txEvent.transaction;

  // check if an address in the watchlist was the initiator of the transaction
  addresses.forEach(function(address) {
    if (from === address) {
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
          everestId: '0xa3d1fd85c0b62fa8bab6b818ffc96b5ec57602b6',
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
