const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');
const BigNumber = require('bignumber.js');
const ethers = require('ethers');
const RollingMath = require('rolling-math');

const contractAddresses = require('../../contract-addresses.json');
const { 
  reserveWatch: config,
  aaveEverestId: AAVE_EVEREST_ID,
} = require('../../agent-config.json');

const { windowSize, numStds } = config;
const {
  ProtocolDataProvider: dataProvider,
  PriceOracle: priceOracleAddress,
} = contractAddresses;
const { abi: dataAbi } = require('../../abi/AaveProtocolDataProvider.json');
const { abi: priceOracleAbi } = require('../../abi/IPriceOracle.json');

const provider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());
const ProtocolDataProvider = new ethers.Contract(dataProvider, dataAbi, provider);
const PriceOracle = new ethers.Contract(priceOracleAddress, priceOracleAbi, provider);

let rollingReservePrices = {};

// helper function to create alerts
function createAlert(asset, price) {
  const { symbol } = asset;
  return Finding.fromObject({
    name: `High AAVE ${symbol} Reserve Price Change`,
    description: `${symbol} Price: ${ethers.utils.formatEther(price)} ether `,
    alertId: 'AE-AAVE-RESERVE-PRICE',
    severity: FindingSeverity.Medium,
    type: FindingType.Suspicious,
    everestId: AAVE_EVEREST_ID,
    metadata: {
      symbol,
      price: ethers.utils.formatEther(price),
    },
  });
}

function provideHandleBlock(RollingMathLib, protocolDataProvider, priceOracle) {
  // clear out the RollingMath object for ease of testing
  rollingReservePrices = {};
  return async function handleBlock(blockEvent) {
    const findings = [];

    // override block number so we get data from the block in question
    const override = { blockTag: blockEvent.blockNumber };

    // get the reserve assets
    const reserveAssets = await protocolDataProvider.getAllReservesTokens({ ...override });

    async function generateFindings(asset) {
      const priceWei = await priceOracle.getAssetPrice(asset.tokenAddress, { ...override });
      // convert the amount to a bignum
      const amount = new BigNumber(priceWei.toString());
      // if we haven't seen this reserve before, initialize it
      if (!rollingReservePrices[asset.symbol]) {
        rollingReservePrices[asset.symbol] = new RollingMathLib(windowSize);
      } else {
        const average = rollingReservePrices[asset.symbol].getAverage();
        const standardDeviation = rollingReservePrices[asset.symbol].getStandardDeviation();

        const limit = standardDeviation.times(numStds);
        const delta = amount.minus(average).absoluteValue();
        // if greater than configured standard deviations, report
        if (delta.isGreaterThan(limit)) {
          findings.push(createAlert(asset, priceWei));
        }
      }

      // update the data
      rollingReservePrices[asset.symbol].addElement(amount);
    }

    // generate findings for each asset and catch exceptions so Promise.all does not bail early
    await Promise.all(reserveAssets.map(
      (reserve) => generateFindings(reserve).catch((e) => console.error(e)),
    ));

    return findings;
  };
}

module.exports = {
  provideHandleBlock,
  handleBlock: provideHandleBlock(RollingMath, ProtocolDataProvider, PriceOracle),
  createAlert,
};
