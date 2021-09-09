const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');
const ethers = require('ethers');
const axios = require('axios');
require('dotenv').config();

const debug = false; // enable/disable console logging for debugging

// print log messages only if debug=true
function log(message) {
  if (debug) {
    console.log(message);
  }
}

// computes contract age in days
// units for currentTime and creationTime are SECONDS
function getContractAge(currentTime, creationTime) {
  return Math.floor((currentTime - creationTime) / 60 / (60 * 24));
}

// load config files
const contractAddresses = require('../../contract-addresses.json');
const tokenAddresses = require('./token-addresses.json');

// etherscan API components
// this endpoint will list transactions for a given address, sorted oldest to newest
const baseUrl = 'https://api.etherscan.io/api?module=account&action=txlist&address=';
const options = '&startblock=0&endblock=999999999&page=1&offset=10&sort=asc&apikey=';
const apiKey = process.env.ETHERSCAN_API_KEY; // free tier is limited to 5 calls/sec

// setup provider for contract interaction
const provider = new ethers.providers.WebSocketProvider(getJsonRpcUrl());

// only watch transactions on the LendingPool contract
const lendingPoolV2Address = contractAddresses.LendingPool.toLowerCase();

function provideHandleTransaction(ethersProvider) {
  return async function handleTransaction(txEvent) {
    const findings = [];

    // get all addresses involved with this transaction that are non-Aave contracts
    let addresses = Object.keys(txEvent.addresses);
    // to minimize Etherscan requests (slow and rate limited to 5/sec for the free tier),
    // exclude the lending pool address, the incentives controller, and all token addresses
    let exclusions = [
      lendingPoolV2Address,
      contractAddresses.IncentivesController.toLowerCase(),
    ];
    exclusions = exclusions.concat(tokenAddresses);
    addresses = addresses.filter((item) => exclusions.indexOf(item) < 0);

    // watch for recently created contracts interacting with Aave lending pool
    if (txEvent.transaction.to === lendingPoolV2Address) {
      let address = '';
      let code = '';
      let response = '';
      let currentTime = 0;
      let creationTime = 0;
      let contractAge = 0;

      for (let i = 0; i < addresses.length; i++) {
        address = addresses[i];
        // TODO: add failure handling here
        code = await ethersProvider.getCode(address);
        if (code !== '0x') {
          // this is a contract
          // query the etherscan API for the contract creation date
          // this should be the first transaction item returned in the results
          // TODO: add failure handling here
          response = await axios.get(baseUrl + address + options + apiKey);
          creationTime = response.data.result[0].timeStamp;

          // compute days elapsed since contract creation
          currentTime = Date.now() / 1000;
          log(`Contract address: ${address}`);
          contractAge = getContractAge(currentTime, creationTime);
          log(`Contract was created ${contractAge} days ago`);

          // filter on recent contracts
          if (contractAge < 7) { // created less than 1 week ago
            log(`Contract ${address} was recently created`);
            findings.push(
              Finding.fromObject({
                name: 'New Contract Interaction',
                description: `Aave LendingPool was invoked by new contract ${address}`,
                alertId: 'AE-AAVE-NEW-CONT-INTERACT',
                severity: FindingSeverity.Medium,
                type: FindingType.Suspicious,
                metadata: {
                  address,
                  contractAge,
                },
                everestId: '0xa3d1fd85c0b62fa8bab6b818ffc96b5ec57602b6',
              }),
            );
          }
        }
      }
    }
    return findings;
  };
}

async function teardownProvider(ethersProvider) {
  await ethersProvider.destroy();
}

module.exports = {
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(provider),
  getContractAge,
  lendingPoolV2Address,
};
