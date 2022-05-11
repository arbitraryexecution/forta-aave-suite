const {
  Finding, FindingSeverity, FindingType, ethers, getEthersProvider,
} = require('forta-agent');
const fs = require('fs');
const csv = require('csv-parser');
const BigNumber = require('bignumber.js');

const { getAbi } = require('./utils');

// load any bot configuration parameters
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

const DECIMALS_ABI = ['function decimals() view returns (uint)'];

function createAlert(protocolName, protocolAbbrev, developerAbbrev, type, severity) {
  return Finding.fromObject({
    name: `${protocolName} Treasury Fee Monitor`,
    description: '',
    alertId: `${developerAbbrev}-${protocolAbbrev}-TREASURY-FEE`,
    type: FindingType[type],
    severity: FindingSeverity[severity],
    protocol: protocolName,
    metadata: {
    },
  });
}

function calculateStatistics(currMean, currVariance, currNumDataPoints, newValue) {
  let newMean = 0;
  let newStdDev = 0;
  let newVariance = 0;
  let newNumDataPoints = currNumDataPoints + 1;

  if (currNumDataPoints === 0) {
    newMean = newValue;
    newNumDataPoints = 1;
  } else {
    newMean = (currMean * (currNumDataPoints / newNumDataPoints)) + (newValue / newNumDataPoints);
    newVariance = (
      (((currVariance * currNumDataPoints) + ((newValue - newMean) * (newValue - currMean)))
        / newNumDataPoints)
    );
    newStdDev = Math.sqrt(newVariance);
  }

  return {
    mean: newMean,
    stdDev: newStdDev,
    variance: newVariance,
    numDataPoints: newNumDataPoints,
  };
}

async function parseCsvAndCompute(csvFileName, tokenInfo, tokenPriceInfo) {
  return new Promise((resolve, reject) => {
    let mean = 0;
    let stdDev = 0;
    let variance = 0;
    let numDataPoints = 0;

    fs.createReadStream(`${__dirname}/${csvFileName}`)
      .pipe(csv())
      .on('data', (data) => {
        // scale the premium for each row of data in the CSV file by the given asset's decimals
        const denominator = (new BigNumber(10)).pow(tokenInfo[data.asset]);
        const scaledPremium = parseFloat(
          (new BigNumber(data.premium)).div(denominator),
        );
        const premiumInETH = scaledPremium * tokenPriceInfo[data.asset];

        ({
          mean, stdDev, variance, numDataPoints,
        } = calculateStatistics(mean, variance, numDataPoints, premiumInETH));
      })
      .on('end', () => resolve({
        mean, stdDev, variance, numDataPoints,
      }))
      .on('error', () => reject());
  });
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // assign configurable fields
    data.protocolName = config.protocolName;
    data.protocolAbbreviation = config.protocolAbbreviation;
    data.developerAbbreviation = config.developerAbbreviation;
    data.provider = getEthersProvider();

    const {
      LendingPoolAddressesProvider: lendingPoolAddressesProvider,
      LendingPool: lendingPool,
      ProtocolDataProvider: protocolDataProvider,
      PriceOracle: priceOracle,
    } = config.contracts;

    // from the LendingPoolAddressesProvider, get the address of the LendingPool proxy contract
    const lendingPoolAddressesProviderAbi = getAbi(lendingPoolAddressesProvider.abiFile);
    data.lendingPoolAddressesProviderContract = new ethers.Contract(
      lendingPoolAddressesProvider.address,
      lendingPoolAddressesProviderAbi,
      data.provider,
    );
    data.lendingPoolAddress = await data.lendingPoolAddressesProviderContract.getLendingPool();

    // create a new interface for LendingPool
    const lendingPoolAbi = getAbi(lendingPool.abiFile);
    const lendingPoolInterface = new ethers.utils.Interface(lendingPoolAbi);

    // retrieve the event signature (aka topic hash) for the FlashLoan event from the interface
    const sigTypeHash = ethers.utils.FormatTypes.sighash;
    data.flashLoanTopicHash = ethers.utils.id(
      lendingPoolInterface.getEvent('FlashLoan').format(sigTypeHash),
    );

    const { address: protocolDataProviderAddress } = protocolDataProvider;
    const protocolDataProviderAbi = getAbi(protocolDataProvider.abiFile);
    const protocolDataProviderContract = new ethers.Contract(
      protocolDataProviderAddress,
      protocolDataProviderAbi,
      data.provider,
    );

    // get all aToken addresses from the protocol data provider contract
    data.tokenInfo = {};
    const tokenAddresses = await protocolDataProviderContract.getAllReservesTokens();
    // for each token address returned get its respective decimals
    await Promise.all(tokenAddresses.map(async (token) => {
      // token is an array where the first element is the token symbol and the second element is
      // the address
      const tokenAddress = token[1];
      const tokenContract = new ethers.Contract(tokenAddress, DECIMALS_ABI, data.provider);
      const tokenDecimals = await tokenContract.decimals();
      data.tokenInfo[tokenAddress] = tokenDecimals.toString();
    }));

    // get the address of the price oracle
    const priceOracleAddress = await data.lendingPoolAddressesProviderContract.getPriceOracle();
    const priceOracleAbi = getAbi(priceOracle.abiFile);
    data.priceOracleContract = new ethers.Contract(
      priceOracleAddress,
      priceOracleAbi,
      data.provider,
    );

    // for each asset retrieve a spot price that will be used when computing statistics
    const tokenAddressesList = tokenAddresses.map((token) => token[1]);
    // the spot prices given by the Aave price oracle are in 'ETH wei' units
    const denominatorWEI = (new BigNumber(10)).pow(18);
    const spotPricesScaledETH = {};
    // request all of the prices for the assets in tokenAddressesList from the price oracle
    const spotPricesETH = await data.priceOracleContract.getAssetsPrices(tokenAddressesList);
    // iterate over each price, correlate it with its associated asset token, and scale the price
    spotPricesETH.forEach((price, index) => {
      spotPricesScaledETH[tokenAddressesList[index]] = parseFloat(
        (new BigNumber(price.toString())).div(denominatorWEI),
      );
    });

    // parse the csv file specified in the config file and calculate mean, standard deviation,
    // and variance
    const {
      mean, stdDev, variance, numDataPoints,
    } = await parseCsvAndCompute(config.dataSet, data.tokenInfo, spotPricesScaledETH);
    console.log(mean);
    console.log(stdDev);
    console.log(variance);
    console.log(numDataPoints);
    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    // check for FlashLoan event, if found then check to see if value is a statistical anomaly given
    // the current mean + standard deviation (i.e. 3 std deviations or more larger than mean), if so
    // return a finding, finally re-calculate mean and standard deviation
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
};
