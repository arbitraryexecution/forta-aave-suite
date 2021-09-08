const ethers = require('ethers');
const BigNumber = require('bignumber.js');
const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');

// load required shared types
const {
  LendingPoolAddressesProvider: lendingPoolAddressesProvider,
  ProtocolDataProvider: protocolDataProviderAddress,
} = require('../../contract-addresses.json');
const { abi: protocolDataProviderAbi } = require('../../interfaces/AaveProtocolDataProvider.json');
const { abi: priceOracleAbi } = require('../../interfaces/IPriceOracle.json');
const { abi: chainlinkAggregatorAbi } = require('../../interfaces/IChainlinkAggregator.json');
const { abi: lendingPoolAddressesProviderAbi } = require('../../interfaces/ILendingPoolAddressesProvider.json');

// set up the an ethers provider
const jsonRpcProvider = new ethers.providers.WebSocketProvider(getJsonRpcUrl());

// time threshold over which we trigger alerts (24 hours = 86400 seconds)
// this value comes from the Chainlink web interface for price feeds (mouseover Trigger parameters)
//  'A new trusted answer is written when the off-chain price moves more than the deviation
//   threshold or 86400 seconds have passed since the last answer was written on-chain.'
const ORACLE_AGE_THRESHOLD_SECONDS = 86400;

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
    type: FindingType.Suspicious,
    everestId: '0xa3d1fd85c0b62fa8bab6b818ffc96b5ec57602b6',
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
    priceOracleAbi,
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
  const tokenAddressContractTuples = reserveTokenArray.map((token, index) => {
    const address = priceSourceAddresses[index];
    const contract = priceSourceContractInstances[index];
    return [token, address, contract];
  });

  return tokenAddressContractTuples;
}

function provideHandleBlock(tokensAddressesContractsPromise) {
  return async function handleBlock(blockEvent) {
    const findings = [];

    // settle the promise the first time, all subsequent times just get the resolve() value
    const tokensAddressesContracts = await tokensAddressesContractsPromise;

    // get the timestamp for the current block
    const blockTimestamp = new BigNumber(blockEvent.block.timestamp);

    // override block number so we get data from the block in question
    const override = { blockTag: blockEvent.blockNumber };

    // define the promise function to run for each reserve token
    async function checkOracleAge(tokenAddressContract) {
      const [reserveToken, priceSourceAddress, priceSourceContract] = tokenAddressContract;

      // get the timestamp from the price source contract
      let roundData;
      try {
        roundData = await priceSourceContract.latestRoundData({ ...override });
      } catch (error) {
        return;
      }

      // the updatedAt value is of type ethers.BigNumber
      // ethers.BigNumber is not the same as BigNumber from bignumber.js
      // therefore, we need to convert from ethers.BigNumber to BigNumber
      const timestamp = new BigNumber(roundData.updatedAt.toString());

      // calculate the difference between the current block timestamp and the last oracle update
      const oracleAge = blockTimestamp.minus(timestamp);

      if (oracleAge.isGreaterThan(ORACLE_AGE_THRESHOLD_SECONDS)) {
        findings.push(createAlert(reserveToken, oracleAge, priceSourceAddress));
      }
    }

    // for each reserve token, get the price source address and timestamp
    // forEach does not work with async and promises
    // attach a .catch() method to each promise to prevent any rejections from causing Promise.all
    // from failing fast
    await Promise.all(tokensAddressesContracts.map(
      (tokenAddressContract) => checkOracleAge(
        tokenAddressContract,
      ).catch((error) => console.error(error)),
    ));

    return findings;
  };
}

// closes the ethers provider websocket
async function teardownProvider() {
  await jsonRpcProvider.destroy();
}

module.exports = {
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeTokensContracts()),
  teardownProvider,
};
