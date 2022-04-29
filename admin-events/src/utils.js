const { ethers } = require('forta-agent');

function getAbi(abiName) {
  // eslint-disable-next-line global-require,import/no-dynamic-require
  const { abi } = require(`../abi/${abiName}`);
  return abi;
}

function getEventSignatures(contract, events) {
  // given a contract object which contains an ethers.js interface and a list of event names,
  // return a list of full event signatures
  const eventSignatures = [];
  const { iface } = contract;

  events.forEach((eventName) => {
    const fragment = iface.getEvent(eventName);
    eventSignatures.push(fragment.format(ethers.utils.FormatTypes.full));
  });

  return eventSignatures;
}

module.exports = {
  getAbi,
  getEventSignatures,
};
