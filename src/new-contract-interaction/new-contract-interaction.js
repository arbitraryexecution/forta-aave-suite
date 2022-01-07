const {
  FindingType,
  FindingSeverity,
  Finding,
  getJsonRpcUrl,
} = require('forta-agent');
const ethers = require('ethers');
const axios = require('axios');

const DEBUG = false; // enable/disable console logging for debugging

// load configuration data from agent config file
const {
  newContractInteraction,
  aaveEverestId: AAVE_EVEREST_ID,
} = require('../../agent-config.json');

// load required shared types
let {
  IncentivesController: incentivesControllerAddress,
  LendingPool: lendingPoolAddress,
} = require('../../contract-addresses.json');
const {
  ProtocolDataProvider: protocolDataProviderAddress,
} = require('../../contract-addresses.json');
const { abi: protocolDataProviderAbi } = require('../../abi/AaveProtocolDataProvider.json');

// convert addresses that need to be matched in transactions to lowercase
incentivesControllerAddress = incentivesControllerAddress.toLowerCase();
lendingPoolAddress = lendingPoolAddress.toLowerCase();

// stores aToken addresses
let aTokenAddresses;

// read the .env file and populate process.env with keys/values
require('dotenv').config();

// etherscan API components
// this endpoint will list transactions for a given address, sorted oldest to newest
const BASE_URL = 'https://api.etherscan.io/api?module=account&action=txlist&address=';
const OPTIONS = '&startblock=0&endblock=999999999&page=1&offset=10&sort=asc&apikey=';
const API_KEY = process.env.ETHERSCAN_API_KEY; // free tier is limited to 5 calls/sec

// set up provider for contract interaction
const provider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());

// set up the contract object for interacting with the protocolDataProvider contract
const protocolDataProviderContract = new ethers.Contract(
  protocolDataProviderAddress, protocolDataProviderAbi, provider,
);

// print log messages only if DEBUG=true
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

// gets a list of all aToken addresses currently registered with the ProtocolDataProvider
// contract
// the mainnet.json file online (https://aave.github.io/aave-addresses/mainnet.json) appears to
// be out of sync with the data returned by getAllATokens(), so we take the contract as the source
// of truth
async function getATokenAddresses(protocolDataProvider) {
  const aTokens = await protocolDataProvider.getAllATokens();
  const tokenAddresses = [];
  aTokens.forEach((aToken) => {
    tokenAddresses.push(aToken.tokenAddress.toLowerCase());
  });
  return tokenAddresses;
}

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

function provideHandleTransaction(ethersProvider, protocolDataProvider) {
  return async function handleTransaction(txEvent) {
    const findings = [];

    // for performance reasons, don't continue to run this handler if an Etherscan API key
    // was not provided
    if (API_KEY === undefined) {
      return findings;
    }

    // get atoken addresses (one-time operation)
    // these addresses will be seen interacting with the lending pool in transactions,
    // so we filter them out later
    if (aTokenAddresses === undefined) {
      aTokenAddresses = await getATokenAddresses(protocolDataProvider);
    }

    // get all addresses involved with this transaction
    let addresses = Object.keys(txEvent.addresses);

    // to minimize Etherscan requests (slow and rate limited to 5/sec for the free tier),
    // exclude the lending pool address, the incentives controller, and all token addresses
    let exclusions = [
      lendingPoolAddress,
      incentivesControllerAddress,
    ];
    exclusions = exclusions.concat(aTokenAddresses);

    // filter transaction addresses to remove Aave contract addresses
    addresses = addresses.filter((item) => exclusions.indexOf(item) < 0);

    // watch for recently created contracts interacting with Aave lending pool
    if (txEvent.transaction.to === lendingPoolAddress) {
      // create an array of promises that retrieve the contract code for each address
      const contractCodePromises = [];
      let contractCode = [];
      addresses.forEach((address) => {
        // RPC call for contract code
        const codePromise = ethersProvider.getCode(address);

        // associate each address with the code that was returned
        codePromise
          .then((result) => contractCode.push({ address, code: result }))
          // to prevent Promise.all() from rejecting, catch failed promises and set the return
          // value to undefined
          .catch(() => contractCodePromises.push(undefined));
      });

      // wait for the promises to be settled
      await Promise.all(contractCodePromises);

      // filter out EOAs from our original list of addresses
      contractCode = contractCode.filter((item) => (item.code !== '0x'));
      addresses = contractCode.map((item) => item.address);

      // Next, for each contract, query the Etherscan API for the list of transactions
      // the first transaction item returned in the results will be the earliest
      const etherscanTxlistPromises = [];
      const txData = [];
      contractCode.forEach((item) => {
        const txlistPromise = axios.get(BASE_URL + item.address + OPTIONS + API_KEY);

        // associate each address with the transaction list that was returned
        txlistPromise
          .then((result) => txData.push({ address: item.address, response: result }))
          // to prevent Promise.all() from rejecting, catch failed promises and set the return
          // value to undefined
          .catch(() => etherscanTxlistPromises.push(undefined));
      });

      // wait for the promises to be settled
      await Promise.all(etherscanTxlistPromises);

      // process the results
      txData.forEach((item) => {
        // bail if the API did not return a valid result
        if (item.response.data.status === 0) {
          return;
        }

        // get the timestamp from the earliest transaction
        const creationTime = item.response.data.result[0].timeStamp;

        // compute days elapsed since contract creation
        const currentTime = txEvent.timestamp;
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
  handleTransaction: provideHandleTransaction(provider, protocolDataProviderContract),
  getContractAge,
  createAlert,
  lendingPoolAddress,
};
