const {
  Finding, FindingSeverity, FindingType, ethers,
} = require('forta-agent');

const { getAbi, getEventSignatures } = require('./utils');

// load config data
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

function createAlert(
  contractAddress, contractName, eventName, developerAbbrev, protocolName, protocolAbbrev,
) {
  return Finding.fromObject({
    name: `${protocolName} Admin Event`,
    description: `The ${eventName} event was emitted by the ${contractName} contract`,
    alertId: `${developerAbbrev}-${protocolAbbrev}-ADMIN-EVENT`,
    type: FindingType.Suspicious,
    severity: FindingSeverity.Low,
    metadata: {
      contractName,
      contractAddress,
      eventName,
    },
  });
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // assign configurable fields
    data.adminEvents = config.contracts;
    data.protocolName = config.protocolName;
    data.protocolAbbreviation = config.protocolAbbreviation;
    data.developerAbbreviation = config.developerAbbreviation;

    // load the contract addresses, abis, and ethers interfaces
    data.contracts = Object.entries(data.adminEvents).map(([name, entry]) => {
      if (entry.address === undefined) {
        throw new Error(`No address found in configuration file for '${name}'`);
      }

      if (entry.abiFile === undefined) {
        throw new Error(`No ABI file found in configuration file for '${name}'`);
      }

      const abi = getAbi(entry.abiFile);
      const iface = new ethers.utils.Interface(abi);

      const contract = {
        name,
        address: entry.address,
        iface,
      };

      contract.eventSignatures = getEventSignatures(contract, entry.events);
      return contract;
    });

    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const {
      developerAbbreviation, protocolName, protocolAbbreviation, contracts,
    } = data;
    const findings = [];

    // iterate over each contract to get the address and events
    contracts.forEach((contract) => {
      // for each contract name, lookup the address and respective event signatures
      const { name, address, eventSignatures } = contract;

      // for each contract address, check for event matches
      const parsedLogs = txEvent.filterLog(eventSignatures, address);

      // create a finding for each log in parsedLogs
      parsedLogs.forEach((parsedLog) => {
        findings.push(
          createAlert(
            address,
            name,
            parsedLog.name,
            developerAbbreviation,
            protocolName,
            protocolAbbreviation,
          ),
        );
      });
    });

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
};
