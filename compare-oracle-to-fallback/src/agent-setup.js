const { ethers, getEthersProvider } = require('forta-agent');

// load required ABIs
const { abi: protocolDataProviderAbi } = require('../abi/AaveProtocolDataProvider.json');
const { abi: aaveOracleAbi } = require('../abi/AaveOracle.json');
const { abi: priceOracleGetterAbi } = require('../abi/IPriceOracleGetter.json');
const { abi: lendingPoolAddressesProviderAbi } = require('../abi/ILendingPoolAddressesProvider.json');

// load config
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

// percent error threshold over which we trigger alerts
// percent error = (absolute(oracle - fallbackOracle) / oracle) * 100
const AAVE_ORACLE_PERCENT_ERROR_THRESHOLD = config.aaveOraclePercentErrorThreshold;
const ALERT_MINIMUM_INTERVAL_SECONDS = config.alertMinimumIntervalSeconds;

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // set up the an ethers provider
    const jsonRpcProvider = getEthersProvider();
    const protocolDataProviderAddress = config.contractAddresses.ProtocolDataProvider;
    const lendingPoolAddressesProvider = config.contractAddresses.LendingPoolAddressesProvider;

    // create instances of ethers contracts to call read-only methods
    const protocolDataProviderContract = new ethers.Contract(
      protocolDataProviderAddress, protocolDataProviderAbi, jsonRpcProvider,
    );
    const lendingPoolAddressProviderContract = new ethers.Contract(
      lendingPoolAddressesProvider, lendingPoolAddressesProviderAbi, jsonRpcProvider,
    );

    // get an array of all of the reserve tokens, in the form of TokenData struct entries
    // ref: https://docs.aave.com/developers/the-core-protocol/protocol-data-provider#getallreservestokens
    const reserveTokens = await protocolDataProviderContract.getAllReservesTokens();

    // get the AAVE price oracle address
    const aaveOracleAddress = await lendingPoolAddressProviderContract.getPriceOracle();
    const aaveOracleContractInstance = new ethers.Contract(
      aaveOracleAddress,
      aaveOracleAbi,
      jsonRpcProvider,
    );

    // get the fallback oracle address
    const fallbackOracleAddress = await aaveOracleContractInstance.getFallbackOracle();

    // create ethers contract to run read-only methods from the fallback oracle contract
    const fallbackOracleContractInstance = new ethers.Contract(
      fallbackOracleAddress,
      priceOracleGetterAbi,
      jsonRpcProvider,
    );

    // none of the fallback oracles are well maintained, so we expect alerts for every block
    // therefore, we will generate the first alert, then suppress any additional alerts over a 24
    // hour period, counting the number that would have been generated, then generate another alert
    // when the 24 hour time period has expired
    // create an array of token / oracle / fallback / alerts objects that we will iterate over
    const tokenContractFallbackAlertTuples = reserveTokens.map((reserveToken) => ({
      reserveToken,
      aaveOracleContractInstance,
      fallbackOracleContractInstance,
      tokenAlert: {
        numAlertsInLastDay: 0,
        tStart: 0,
      },
    }));

    // assign configurable fields
    data.protocolName = config.protocolName;
    data.protocolAbbrev = config.protocolAbbreviation;
    data.developerAbbrev = config.developerAbbreviation;
    data.tokenContractFallbackAlertTuples = tokenContractFallbackAlertTuples;
    /* eslint-enable no-param-reassign */
  };
}

module.exports = {
  AAVE_ORACLE_PERCENT_ERROR_THRESHOLD,
  ALERT_MINIMUM_INTERVAL_SECONDS,
  initializeData,
  provideInitialize,
};
