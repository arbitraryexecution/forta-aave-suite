const {
  Finding, FindingSeverity, FindingType, ethers,
} = require('forta-agent');
const BigNumber = require('bignumber.js');
const RollingMath = require('rolling-math');

const { getAbi } = require('./utils');

// load config
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

// helper function to create alerts
function createAlert(developerAbbrev, protocolName, protocolAbbrev, log, type, severity) {
  return Finding.fromObject({
    name: `${protocolName} High ${log.name} Amount`,
    description: `A transaction utilized a large amount of ${log.args.reserve}`,
    alertId: `${developerAbbrev}-${protocolAbbrev}-HIGH-TX-AMOUNT`,
    severity: FindingSeverity[severity],
    type: FindingType[type],
    metadata: {
      event: log.name,
      amount: log.args.amount.toString(),
      token: log.args.reserve,
    },
  });
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    const { LendingPool: lendingPoolConfig } = config.contract;
    const abi = getAbi(lendingPoolConfig.abiFile);

    // create ethers interface object
    const iface = new ethers.utils.Interface(abi);

    // events we are interested in
    const eventFragments = [
      iface.getEvent('Borrow'),
      iface.getEvent('Deposit'),
      iface.getEvent('Repay'),
      iface.getEvent('Withdraw'),
    ];

    // assign configurable fields
    data.address = lendingPoolConfig.address;
    data.protocolName = config.protocolName;
    data.protocolAbbrev = config.protocolAbbreviation;
    data.developerAbbrev = config.developerAbbreviation;
    data.eventFragments = eventFragments;
    data.type = lendingPoolConfig.type;
    data.severity = lendingPoolConfig.severity;

    // create rolling math object structure
    data.rollingEventData = {};
    data.windowSize = lendingPoolConfig.windowSize;
    data.standardDeviations = lendingPoolConfig.standardDeviations;
    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const {
      developerAbbrev,
      protocolName,
      protocolAbbrev,
      address,
      eventFragments,
      type,
      severity,
      rollingEventData,
      windowSize,
      standardDeviations,
    } = data;
    const findings = [];
    const parsedLogs = txEvent.filterLog(eventFragments, address);

    // loop over each eventLog, checking for anomalous value
    parsedLogs.forEach((log) => {
      // rolling math requires bignumber.js style BigNumbers
      const amount = new BigNumber(log.args.amount.toHexString());

      // if we haven't seen this reserve yet, initialize it
      const { reserve } = log.args;
      if (!rollingEventData[reserve]) {
        rollingEventData[reserve] = new RollingMath(windowSize);
      }

      // only process data for alerts if we have seen a significant number of blocks
      if (rollingEventData[reserve].getNumElements() >= windowSize) {
        // if we have seen this before, check for anomalous value
        const average = rollingEventData[reserve].getAverage();
        const standardDeviation = rollingEventData[reserve].getStandardDeviation();

        // limit is set from agent-config.json file
        const limit = standardDeviation.times(standardDeviations);
        const delta = amount.minus(average).absoluteValue();

        // if instance is outside the standard deviation, report
        if (delta.isGreaterThan(limit)) {
          findings.push(
            createAlert(developerAbbrev, protocolName, protocolAbbrev, log, type, severity),
          );
        }
      }

      // update rolling data
      rollingEventData[reserve].addElement(amount);
    });

    return findings;
  };
}

// exports
module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
};
