const ethers = require('ethers');
const BigNumber = require('bignumber.js');
const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const RollingMath = require('rolling-math');

// load required shared types
const { LendingPool: address } = require('../../contract-addresses.json');
const { abi } = require('../../abi/ILendingPool.json');

const { anomalousValue, aaveEverestId: AAVE_EVEREST_ID } = require('../../agent-config.json');

// create ethers interface object
const iface = new ethers.utils.Interface(abi);

// events we are interested in
const eventFragments = [
  iface.getEvent('Borrow'),
  iface.getEvent('Deposit'),
  iface.getEvent('Repay'),
  iface.getEvent('Withdraw'),
];

// create rolling math object structure
const rollingEventData = {};

// helper function to create alerts
function createAlert(log) {
  return Finding.fromObject({
    name: `High AAVE ${log.name} Amount`,
    description: `A transaction utilized a large amount of ${log.args.reserve}`,
    alertId: 'AE-AAVE-HIGH-TX-AMOUNT',
    severity: FindingSeverity.Medium,
    type: FindingType.Suspicious,
    everestId: AAVE_EVEREST_ID,
    metadata: {
      event: log.name,
      amount: log.args.amount.toString(),
      token: log.args.reserve,
    },
  });
}

async function handleTransaction(txEvent) {
  const findings = [];

  const parsedLogs = txEvent.filterLog(eventFragments, address);

  // loop over each eventLog, checking for anomalous value
  parsedLogs.forEach((log) => {
    // rolling math requires bignumber.js style BigNumbers
    const amount = new BigNumber(log.args.amount.toHexString());

    // if we haven't seen this reserve yet, initialize it
    if (!rollingEventData[log.args.reserve]) {
      rollingEventData[log.args.reserve] = new RollingMath(anomalousValue.windowSize);
    }

    // only process data for alerts if we have seen a significant number of blocks
    if (rollingEventData[log.args.reserve].getNumElements() >= anomalousValue.windowSize) {
      // if we have seen this before, check for anomalous value
      const average = rollingEventData[log.args.reserve].getAverage();
      const standardDeviation = rollingEventData[log.args.reserve].getStandardDeviation();

      // limit is set from agent-config.json file
      const limit = standardDeviation.times(anomalousValue.standardDeviations);
      const delta = amount.minus(average).absoluteValue();

      // if instance is outside the standard deviation, report
      if (delta.isGreaterThan(limit)) {
        findings.push(createAlert(log));
      }
    }

    // update rolling data
    rollingEventData[log.args.reserve].addElement(amount);
  });

  return findings;
}

// exports
module.exports = {
  handleTransaction,
};
