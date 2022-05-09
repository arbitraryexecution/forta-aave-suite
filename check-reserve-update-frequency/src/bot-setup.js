const { ethers, getEthersProvider } = require('forta-agent');

// load required ABIs
const { abi: protocolDataProviderAbi } = require('../abi/AaveProtocolDataProvider.json');
const { abi: aaveOracleAbi } = require('../abi/AaveOracle.json');
const { abi: chainlinkAggregatorAbi } = require('../abi/AggregatorV3Interface.json');
const { abi: lendingPoolAddressesProviderAbi } = require('../abi/ILendingPoolAddressesProvider.json');

// load config
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

// time threshold over which we trigger alerts (24 hours = 86400 seconds)
// this value comes from the Chainlink web interface for price feeds (mouseover Trigger parameters)
//  'A new trusted answer is written when the off-chain price moves more than the deviation
//   threshold or 86400 seconds have passed since the last answer was written on-chain.'
const ORACLE_AGE_THRESHOLD_SECONDS = config.oracleAgeThresholdSeconds;

// there are several reserve tokens in AAVE that do not use Chainlink price oracles
// we will filter these out before we attempt to determine the age of the oracle data
// Gemini Dollar uses ExtendedGusdPriceProxy source: 0xEc6f4Cd64d28Ef32507e2dc399948aAe9Bbedd7e
// xSUSHI Token uses XSushiPriceAdapter source: 0x9b26214bEC078E68a394AaEbfbffF406Ce14893F
// Wrapped Ether uses Black Hole source: 0x0000000000000000000000000000000000000000
// ENS uses a Chainlink aggregator with a deprecated function call
const TOKENS_WITHOUT_CHAINLINK_ABI = [
  '0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd', // Gemini Dollar
  '0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272', // xSUSHI Token
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Wrapped Ether
  '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72', // ENS
];

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
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
    let reserveTokenArray = await protocolDataProviderContract.getAllReservesTokens();

    // remove tokens that do not have Chainlink price oracles
    reserveTokenArray = reserveTokenArray.filter(
      (reserveToken) => TOKENS_WITHOUT_CHAINLINK_ABI.indexOf(reserveToken.tokenAddress) === -1,
    );

    // get the AAVE price oracle address
    const priceOracleAddress = await lendingPoolAddressProviderContract.getPriceOracle();
    const priceOracleContractInstance = new ethers.Contract(
      priceOracleAddress, aaveOracleAbi, jsonRpcProvider,
    );

    // get the price source addresses
    const priceSourceAddresses = await Promise.all(reserveTokenArray.map(
      (reserveToken) => priceOracleContractInstance.getSourceOfAsset(reserveToken.tokenAddress),
    ));

    // create ethers contracts to run read-only methods from the Chainlink contracts
    const priceSourceContractInstances = priceSourceAddresses.map(
      (priceSourceAddress) => new ethers.Contract(
        priceSourceAddress, chainlinkAggregatorAbi, jsonRpcProvider,
      ),
    );

    // create an array of token / address / contract objects that we will iterate over
    const tokenAddressContractTuples = reserveTokenArray.map((reserveToken, index) => {
      const priceSourceAddress = priceSourceAddresses[index];
      const priceSourceContract = priceSourceContractInstances[index];
      return { reserveToken, priceSourceAddress, priceSourceContract };
    });

    // assign configurable fields
    data.protocolName = config.protocolName;
    data.protocolAbbrev = config.protocolAbbreviation;
    data.developerAbbrev = config.developerAbbreviation;
    data.tokenAddressContractTuples = tokenAddressContractTuples;
    /* eslint-enable no-param-reassign */
  };
}

module.exports = {
  ORACLE_AGE_THRESHOLD_SECONDS,
  initializeData,
  provideInitialize,
};
