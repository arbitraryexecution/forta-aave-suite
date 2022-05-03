const { ethers, getEthersProvider } = require('forta-agent');

// load required ABIs
const { abi: DataAbi } = require('../abi/AaveProtocolDataProvider.json');
const { abi: LendingPoolAbi } = require('../abi/ILendingPool.json');

// load config
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // load contract addresses from config
    const {
      LendingPool: lendingPoolAddr, ProtocolDataProvider: dataProviderAddr,
    } = config.contractAddresses;

    // set up an ethers provider
    const provider = getEthersProvider();

    // set up handle to Aave's LendingPool contract
    const lendingPoolContract = new ethers.Contract(lendingPoolAddr, LendingPoolAbi, provider);
    const dataProviderContract = new ethers.Contract(dataProviderAddr, DataAbi, provider);
    data.lendingPoolContract = lendingPoolContract;
    data.dataProviderContract = dataProviderContract;

    // load bot config values
    const {
      windowSize, numStdDeviations, minElements, dataFields,
    } = config.totalValueAndLiquidity;

    // create rolling math object structure
    data.rollingLiquidityData = {};
    data.windowSize = windowSize;
    data.numStdDeviations = numStdDeviations;
    data.minElements = minElements;

    // assign configurable fields
    data.protocolName = config.protocolName;
    data.protocolAbbrev = config.protocolAbbreviation;
    data.developerAbbrev = config.developerAbbreviation;
    data.dataFields = dataFields;
    /* eslint-enable no-param-reassign */
  };
}

module.exports = {
  initializeData,
  provideInitialize,
};
