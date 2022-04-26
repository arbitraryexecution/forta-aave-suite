const BigNumber = require('bignumber.js');
const {
  Finding, FindingSeverity, FindingType, ethers, getEthersProvider,
} = require('forta-agent');
const RollingMath = require('rolling-math');

// load required ABIs and config
const { abi: dataAbi } = require('../abi/AaveProtocolDataProvider.json');
const { abi: priceOracleAbi } = require('../abi/IPriceOracle.json');
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

// helper function to create alerts
function createAlert(developerAbbrev, protocolName, protocolAbbrev, asset, price, type, severity) {
  const { symbol } = asset;
  return Finding.fromObject({
    name: `High ${protocolName} ${symbol} Reserve Price Change`,
    description: `${symbol} Price: ${ethers.utils.formatEther(price)} ether`,
    alertId: `${developerAbbrev}-${protocolAbbrev}-RESERVE-PRICE`,
    severity: FindingSeverity[severity],
    type: FindingType[type],
    metadata: {
      symbol,
      price: ethers.utils.formatEther(price),
    },
  });
}

async function checkReservePrice(asset, override, data) {
  const {
    priceOracle, rollingReservePrices, windowSize, standardDeviations,
  } = data;
  const priceWei = await priceOracle.getAssetPrice(asset.tokenAddress, { ...override });

  // convert the amount to a bignumber.js BigNumber
  const amount = new BigNumber(priceWei.toString());

  // if we haven't seen this reserve before, initialize it
  if (!rollingReservePrices[asset.symbol]) {
    rollingReservePrices[asset.symbol] = new RollingMath(windowSize);
  }

  // only process data for alerts if we have seen a significant number of blocks
  if (rollingReservePrices[asset.symbol].getNumElements() >= windowSize) {
    const average = rollingReservePrices[asset.symbol].getAverage();
    const standardDeviation = rollingReservePrices[asset.symbol].getStandardDeviation();

    const limit = standardDeviation.times(standardDeviations);
    const delta = amount.minus(average).absoluteValue();
    // if greater than configured standard deviations, report
    if (delta.isGreaterThan(limit)) {
      const {
        developerAbbrev, protocolName, protocolAbbrev, type, severity,
      } = data;
      return [
        createAlert(developerAbbrev, protocolName, protocolAbbrev, asset, priceWei, type, severity),
      ];
    }
  }

  // update the data
  rollingReservePrices[asset.symbol].addElement(amount);
  return [];
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // pull information from config
    const { ProtocolDataProvider: dataProviderAddress } = config.contractAddresses;
    const { PriceOracle: priceOracleAddress } = config.contractAddresses;
    const {
      windowSize, numStdDeviations, type, severity,
    } = config.reserveWatch;

    // create ethers.js contracts
    const provider = getEthersProvider();
    data.protocolDataProvider = new ethers.Contract(dataProviderAddress, dataAbi, provider);
    data.priceOracle = new ethers.Contract(priceOracleAddress, priceOracleAbi, provider);

    // assign configurable fields
    data.protocolName = config.protocolName;
    data.protocolAbbrev = config.protocolAbbreviation;
    data.developerAbbrev = config.developerAbbreviation;
    data.type = type;
    data.severity = severity;

    // create rolling math object structure
    data.rollingReservePrices = {};
    data.windowSize = windowSize;
    data.standardDeviations = numStdDeviations;
    /* eslint-enable no-param-reassign */
  };
}

function provideHandleBlock(data) {
  return async function handleBlock(blockEvent) {
    // override block number so we get data from the block in question
    const override = { blockTag: blockEvent.blockNumber };
    const { protocolDataProvider } = data;

    // get the reserve assets
    const reserveAssets = await protocolDataProvider.getAllReservesTokens({ ...override });

    // generate findings for each asset and catch exceptions so Promise.all does not bail early
    const findings = (await Promise.all(reserveAssets.map(
      (reserve) => checkReservePrice(reserve, override, data).catch((e) => console.error(e)),
    ))).flat();

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeData),
};
