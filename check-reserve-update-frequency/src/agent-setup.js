const ethers = require('ethers');
const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');

// load required shared types
const {
  LendingPoolAddressesProvider: lendingPoolAddressesProvider,
  ProtocolDataProvider: protocolDataProviderAddress,
} = require('../contract-addresses.json');
const { abi: protocolDataProviderAbi } = require('../abi/AaveProtocolDataProvider.json');
const { abi: aaveOracleAbi } = require('../abi/AaveOracle.json');
const { abi: chainlinkAggregatorAbi } = require('../abi/AggregatorV3Interface.json');
const { abi: lendingPoolAddressesProviderAbi } = require('../abi/ILendingPoolAddressesProvider.json');

const { aaveEverestId: AAVE_EVEREST_ID } = require('../agent-config.json');

// set up the an ethers provider
// use ethers.providers.JsonRpcProvider() in lieu of ethers.providers.WebSocketProvider()
// websockets are not supported in production
const jsonRpcProvider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());

// there are several reserve tokens in AAVE that do not use Chainlink price oracles
// we will filter these out before we attempt to determine the age of the oracle data
// Gemini Dollar uses ExtendedGusdPriceProxy source: 0xEc6f4Cd64d28Ef32507e2dc399948aAe9Bbedd7e
// xSUSHI Token uses XSushiPriceAdapter source: 0x9b26214bEC078E68a394AaEbfbffF406Ce14893F
// Wrapped Ether uses Black Hole source: 0x0000000000000000000000000000000000000000
const TOKENS_WITHOUT_CHAINLINK_ABI = [
  '0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd', // Gemini Dollar
  '0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272', // xSUSHI Token
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Wrapped Ether
];

// helper function to create alerts
function createAlert(reserveToken, oracleAge, priceSourceAddress) {
  return Finding.fromObject({
    name: `Stale AAVE Price Oracle Data for ${reserveToken.symbol}`,
    description: `Token ${reserveToken.symbol} Price Oracle Age: ${oracleAge} seconds`,
    alertId: 'AE-AAVE-PRICE-ORACLE-STALE',
    severity: FindingSeverity.Medium,
    type: FindingType.Degraded,
    everestId: AAVE_EVEREST_ID,
    metadata: {
      symbol: reserveToken.symbol,
      tokenAddress: reserveToken.tokenAddress,
      oracleAge,
      priceSourceAddress,
    },
  });
}

async function initializeTokensContracts() {
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
    priceOracleAddress,
    aaveOracleAbi,
    jsonRpcProvider,
  );

  // get the price source addresses
  const priceSourceAddresses = await Promise.all(reserveTokenArray.map(
    (reserveToken) => priceOracleContractInstance.getSourceOfAsset(reserveToken.tokenAddress),
  ));

  // create ethers contracts to run read-only methods from the Chainlink contracts
  const priceSourceContractInstances = priceSourceAddresses.map(
    (priceSourceAddress) => new ethers.Contract(
      priceSourceAddress,
      chainlinkAggregatorAbi,
      jsonRpcProvider,
    ),
  );

  // create an array of token / address / contract tuples that we will iterate over
  const tokenAddressContractTuples = reserveTokenArray.map((reserveToken, index) => {
    const priceSourceAddress = priceSourceAddresses[index];
    const priceSourceContract = priceSourceContractInstances[index];
    return { reserveToken, priceSourceAddress, priceSourceContract };
  });

  return tokenAddressContractTuples;
}

module.exports = {
  initializeTokensContracts,
  createAlert,
};
