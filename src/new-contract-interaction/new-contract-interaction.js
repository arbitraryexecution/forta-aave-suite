const {
  FindingType,
  FindingSeverity,
  Finding,
  getJsonRpcUrl,
} = require('forta-agent');
const ethers = require('ethers');
const axios = require('axios');

// load configuration data from agent config file
const {
  newContractInteraction,
  aaveEverestId: AAVE_EVEREST_ID,
} = require('../../agent-config.json');

// read the .env file and populate process.env with keys/values
require('dotenv').config();

const DEBUG = false; // enable/disable console logging for debugging

// print log messages only if debug=true
function log(message) {
  if (DEBUG) {
    console.log(message); // eslint-disable-line no-console
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
const provider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());

// only watch transactions on the LendingPool contract
const lendingPoolV2Address = contractAddresses.LendingPool.toLowerCase();

// helper function to create alerts
function createAlert(address, contractAge) {
  return Finding.fromObject({
    name: 'New Contract Interaction',
    description: `Aave LendingPool transaction with new contract ${address}`,
    alertId: 'AE-AAVE-NEW-CONTRACT-INTERACTION',
    severity: FindingSeverity.Medium,
    type: FindingType.Suspicious,
    metadata: {
      address,
      contractAge,
    },
    everestId: AAVE_EVEREST_ID,
  });
}

function provideHandleTransaction(ethersProvider) {
  return async function handleTransaction(txEvent) {
    const findings = [];

    // for performance reasons, don't continue to run this handler if an Etherscan API key
    // was not provided
    if (apiKey === undefined) {
      return findings;
    }

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
      // create an array of promises that retrive the contract code for each address
      const contractCodePromises = [];
      let contractCode = [];
      addresses.forEach((address) => {
        // RPC call for contract code
        const codePromise = ethersProvider.getCode(address);

        // associate each address with the code that was returned
        codePromise.then((result) => contractCode.push({ address, code: result }));

        // to prevent Promise.all() from rejecting, catch failed promises and set the return
        // value to undefined
        contractCodePromises.push(codePromise.catch(() => undefined));
      });

      // resolve the requests
      await Promise.all(contractCodePromises);

      // filter out EOAs from our original list of addresses
      contractCode = contractCode.filter((item) => (item.code !== '0x'));
      addresses = contractCode.map((item) => item.address);

      // Next, for each contract, query the Etherscan API for the list of transactions
      // the first transaction item returned in the results will be the earliest
      const etherscanTxlistPromises = [];
      const txData = [];
      contractCode.forEach((item) => {
        const txlistPromise = axios.get(baseUrl + item.address + options + apiKey);

        // associate each address with the transaction list that was returned
        txlistPromise.then((result) => txData.push({ address: item.address, response: result }));

        // to prevent Promise.all() from rejecting, catch failed promises and set the return
        // value to undefined
        etherscanTxlistPromises.push(txlistPromise.catch(() => undefined));
      });

      // resolve the requests
      await Promise.all(etherscanTxlistPromises);

      // process the results
      txData.forEach((item) => {
        // get the timestamp from the earliest transaction
        const creationTime = item.response.data.result[0].timeStamp;

        // compute days elapsed since contract creation
        const currentTime = Date.now() / 1000;
        log(`Contract address: ${item.address}`);
        const contractAge = getContractAge(currentTime, creationTime);
        log(`Contract was created ${contractAge} days ago`);

        // filter on recent contracts (default value is 7 days; defined in agent-config.json)
        if (contractAge < newContractInteraction.thresholdAgeDays) {
          log(`Contract ${item.address} was recently created`);
          findings.push(createAlert(item.address, contractAge));
        }
      });
    }
    return findings;
  };
}

module.exports = {
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(provider),
  getContractAge,
  createAlert,
  lendingPoolV2Address,
};
