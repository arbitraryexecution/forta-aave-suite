const {
  Finding, FindingSeverity, FindingType, ethers, getEthersProvider,
} = require('forta-agent');

const {
  getAbi,
  extractEventArgs,
  getEventInfo,
} = require('./utils');

// load any bot configuration parameters
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

function createAlert(protocolName, protocolAbbrev, developerAbbrev, eventInfo, logArgs) {
  const { name, type, severity } = eventInfo;
  const eventArgs = extractEventArgs(logArgs);

  return Finding.fromObject({
    name: `${protocolName} Lending Pool Loan Event`,
    description: `The ${name} event was emitted`,
    alertId: `${developerAbbrev}-${protocolAbbrev}-LOAN-EVENT`,
    type: FindingType[type],
    severity: FindingSeverity[severity],
    protocol: protocolName,
    metadata: {
      eventName: name,
      ...eventArgs,
    },
  });
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // assign configurable fields
    data.protocolName = config.protocolName;
    data.protocolAbbreviation = config.protocolAbbreviation;
    data.developerAbbreviation = config.developerAbbreviation;

    data.provider = getEthersProvider();

    const {
      LendingPoolAddressesProvider: lendingPoolAddressesProvider,
      LendingPool: lendingPool,
    } = config.contracts;

    // from the LendingPoolAddressesProvider, get the address of the LendingPool proxy contract
    const lendingPoolAddressesProviderAbi = getAbi(lendingPoolAddressesProvider.abiFile);
    data.lendingPoolAddressesProviderContract = new ethers.Contract(
      lendingPoolAddressesProvider.address,
      lendingPoolAddressesProviderAbi,
      data.provider,
    );
    data.lendingPoolAddress = await data.lendingPoolAddressesProviderContract.getLendingPool();

    // create a new interface for LendingPool
    const lendingPoolAbi = getAbi(lendingPool.abiFile);
    const lendingPoolInterface = new ethers.utils.Interface(lendingPoolAbi);

    // gather the event signatures, types, and severities for every event listed in the config file
    const sigTypeFull = ethers.utils.FormatTypes.full;
    const { events } = lendingPool;
    data.eventInfo = getEventInfo(lendingPoolInterface, events, sigTypeFull);
    data.eventSignatures = Object.values(data.eventInfo).map((event) => event.signature);
    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const {
      protocolName,
      protocolAbbreviation,
      developerAbbreviation,
      lendingPoolAddress,
      eventInfo,
      eventSignatures,
    } = data;

    // parse the given txEvent's logs to see if any match the monitored event signatures and
    // lending pool address
    const parsedLogs = txEvent.filterLog(eventSignatures, lendingPoolAddress);
    const findings = parsedLogs.map((parsedLog) =>
      // generate a finding for each log that was returned by filterLog
      // eslint-disable-next-line implicit-arrow-linebreak
      createAlert(
        protocolName,
        protocolAbbreviation,
        developerAbbreviation,
        eventInfo[parsedLog.name],
        parsedLog.args,
      ));

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
};
