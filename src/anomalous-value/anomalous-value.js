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
const eventNames = ['Borrow', 'Deposit', 'Repay', 'Withdraw'];

// create rolling math object structure
const rollingEventData = {};

// helper function to create alerts
function createAlert(log) {
  return Finding.fromObject({
    name: `High AAVE ${log.name} Amount`,
    description: `${log.name}: ${log.args.amount.toString()}\nToken: ${log.args.reserve}`,
    alertId: 'AE-AAVE-HIGH-TX-AMOUNT',
    severity: FindingSeverity.Medium,
    type: FindingType.Suspicious,
    everestId: AAVE_EVEREST_ID,
    metadata: JSON.stringify(log),
  });
}

function filterAndParseLogs(logs) {
  // collect logs only from the Aave contract
  const aaveLogs = logs.filter((log) => log.address === address);

  // decode logs and filter on the ones we are interested in
  const parse = (log) => iface.parseLog(log);
  const filter = (log) => eventNames.indexOf(log.name) !== -1;
  const parsedLogs = aaveLogs.map(parse).filter(filter);

  return parsedLogs;
}

async function handleTransaction(txEvent) {
  const findings = [];

  const parsedLogs = filterAndParseLogs(txEvent.logs);

  // loop over each eventLog, checking for anomalous value
  parsedLogs.forEach((log) => {
    // rolling math requires bignumber.js style BigNumbers
    const amount = new BigNumber(log.args.amount.toHexString());

    // if we haven't seen this reserve yet, initialize it
    if (!rollingEventData[log.args.reserve]) {
      rollingEventData[log.args.reserve] = new RollingMath(100);
    } else {
      // if we have seen this before, check for anomalous value
      const average = rollingEventData[log.args.reserve].getAverage();
      const standardDeviation = rollingEventData[log.args.reserve].getStandardDeviation();

      // limit is set from agent-config.json file
      const limit = average.plus(standardDeviation.times(anomalousValue.standardDeviations));
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
  filterAndParseLogs,
  handleTransaction,
};
