const { Finding, FindingSeverity, FindingType, getJsonRpcUrl } = require("forta-agent");
const BigNumber = require("bignumber.js");
const ethers = require("ethers");
const RollingMath = require("rolling-math");

const contractAddresses = require('../../contract-addresses.json');

const { LendingPoolAddressProvider, ProtocolDataProvider: DataProvider } = contractAddresses;
const { abi:DataAbi } = require("../../interfaces/AaveProtocolDataProvider.json");
const { abi:AddressProviderAbi }  = require("../../interfaces/ILendingPoolAddressesProvider.json");
const { abi:PriceOracleAbi } = require("../../interfaces/IPriceOracle.json");

const provider = new ethers.providers.WebSocketProvider(getJsonRpcUrl());
const protocolDataProvider = new ethers.Contract(DataProvider, DataAbi, provider);
const poolAddressProvider = new ethers.Contract(LendingPoolAddressProvider, AddressProviderAbi, provider);

let rollingReservePrices = {};

// helper function to create alerts
function createAlert(asset, price) {
  return Finding.fromObject({
    name: `High AAVE ${asset.symbol} Reserve Price Change`,
    description: `${asset.symbol} Price: ${ethers.utils.formatEther(price)} ether `,
    alertId: 'AE-AAVE-RESERVE-PRICE',
    severity: FindingSeverity.Medium,
    type: FindingType.Suspicious,
    everestId: '0xa3d1fd85c0b62fa8bab6b818ffc96b5ec57602b6',
    metadata: {},
  });
}

function provideHandleBlock(rollingMath) {

  // Clear out the RollingMath object for ease of testing
  rollingReservePrices = {};

  return async function handleBlock(blockEvent) {
    const findings = [];

    // Get the reserve assets
    const reserveAssets = await protocolDataProvider.getAllReservesTokens();
 
    // Get address of the price oracle
    const oracleAddress = await poolAddressProvider.getPriceOracle();
    const priceOracle = new ethers.Contract(oracleAddress, PriceOracleAbi, provider);
    
    await Promise.all(reserveAssets.map(async (asset) => {
      const priceWei = await priceOracle.getAssetPrice(asset.tokenAddress);
    
      // convert the amount to a bignum
      const amount = new BigNumber(priceWei.toString());
    
      // If we haven't seen this reserve before, initialize it
      if (!rollingReservePrices[asset.symbol]) {
        rollingReservePrices[asset.symbol] = new rollingMath(10);
      }

      // Otherwise, check to see if the current price is off
      else {
        const average = rollingReservePrices[asset.symbol].getAverage();
        const stdDeviation = rollingReservePrices[asset.symbol].getStandardDeviation();
        
        // if greater than 2 standard deviations, report
        if (amount.isGreaterThan(average.plus(stdDeviation.times(2)))) {
          findings.push(createAlert(asset, priceWei));
        }
      }

      // update the data
      rollingReservePrices[asset.symbol].addElement(amount);
    }));

    return findings;
  };
}

async function teardownProvider() {
  await provider.destroy();
}

module.exports = {
  provideHandleBlock, 
  handleBlock: provideHandleBlock(RollingMath),
  teardownProvider,
};
