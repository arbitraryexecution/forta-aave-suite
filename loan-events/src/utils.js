// helper function for importing a file located in the abi/ folder given its name
function getAbi(abiName) {
  // eslint-disable-next-line global-require,import/no-dynamic-require
  const { abi } = require(`../abi/${abiName}`);
  return abi;
}

// helper function that identifies key strings in the args array obtained from log parsing
// these key-value pairs will be added to the metadata as event args
// all values are converted to strings so that BigNumbers are readable
function extractEventArgs(args) {
  const eventArgs = {};
  Object.keys(args).forEach((key) => {
    if (Number.isNaN(Number(key))) {
      eventArgs[key] = args[key].toString();
    }
  });
  return eventArgs;
}

// helper function that returns an array of objects containing the name, signature, and configured
// type and severity for each event passed in the events array
function getEventInfo(iface, events, sigType) {
  const result = {};
  Object.entries(events).forEach(([eventName, entry]) => {
    const signature = iface.getEvent(eventName).format(sigType);
    result[eventName] = {
      name: eventName,
      signature,
      type: entry.type,
      severity: entry.severity,
    };
  });
  return result;
}

module.exports = {
  getAbi,
  extractEventArgs,
  getEventInfo,
};
