// helper function for importing a file located in the abi/ folder given its name
function getAbi(abiName) {
  // eslint-disable-next-line global-require,import/no-dynamic-require
  const { abi } = require(`../abi/${abiName}`);
  return abi;
}

module.exports = {
  getAbi,
};