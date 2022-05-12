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

function createAlert(protocolName, protocolAbbrev, developerAbbrev, type, severity, tokenInfo) {
  const {
    tokenAsset,
    tokenPriceEth,
    premiumEth,
  } = tokenInfo;

  return Finding.fromObject({
    name: `${protocolName} Treasury Fee Monitor`,
    description: `An anomalous flash loan premium of ${premiumEth} ETH was paid to the treasury`,
    alertId: `${developerAbbrev}-${protocolAbbrev}-TREASURY-FEE`,
    type: FindingType[type],
    severity: FindingSeverity[severity],
    protocol: protocolName,
    metadata: {
      tokenAsset,
      tokenPriceEth: tokenPriceEth.toString(),
      premiumEth: premiumEth.toString(),
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
        const premiumInEth = scaledPremium * tokenPriceInfo[data.asset];

        ({
          mean, stdDev, variance, numDataPoints,
        } = calculateStatistics(mean, variance, numDataPoints, premiumInEth));
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
    data.type = config.type;
    data.severity = config.severity;

    const {
      LendingPoolAddressesProvider: lendingPoolAddressesProvider,
      LendingPool: lendingPool,
      ProtocolDataProvider: protocolDataProvider,
      PriceOracle: priceOracle,
    } = config.contracts;
    const provider = getEthersProvider();

    // from the LendingPoolAddressesProvider, get the address of the LendingPool proxy contract
    const lendingPoolAddressesProviderAbi = getAbi(lendingPoolAddressesProvider.abiFile);
    data.lendingPoolAddressesProviderContract = new ethers.Contract(
      lendingPoolAddressesProvider.address,
      lendingPoolAddressesProviderAbi,
      provider,
    );
    data.lendingPoolAddress = await data.lendingPoolAddressesProviderContract.getLendingPool();

    // create a new interface for LendingPool
    const lendingPoolAbi = getAbi(lendingPool.abiFile);
    const lendingPoolInterface = new ethers.utils.Interface(lendingPoolAbi);

    // retrieve the event signature for the FlashLoan event from the interface
    const sigTypeFull = ethers.utils.FormatTypes.full;
    data.flashLoanSignature = lendingPoolInterface.getEvent('FlashLoan').format(sigTypeFull);

    const { address: protocolDataProviderAddress } = protocolDataProvider;
    const protocolDataProviderAbi = getAbi(protocolDataProvider.abiFile);
    const protocolDataProviderContract = new ethers.Contract(
      protocolDataProviderAddress,
      protocolDataProviderAbi,
      provider,
    );

    // get all aToken addresses from the protocol data provider contract
    data.tokenInfo = {};
    const tokenAddresses = await protocolDataProviderContract.getAllReservesTokens();
    // for each token address returned get its respective decimals
    await Promise.all(tokenAddresses.map(async (token) => {
      // token is an array where the first element is the token symbol and the second element is
      // the address
      const tokenAddress = token[1];
      const tokenContract = new ethers.Contract(tokenAddress, DECIMALS_ABI, provider);
      const tokenDecimals = await tokenContract.decimals();
      data.tokenInfo[tokenAddress] = tokenDecimals.toString();
    }));

    // get the address of the price oracle
    const priceOracleAddress = await data.lendingPoolAddressesProviderContract.getPriceOracle();
    const priceOracleAbi = getAbi(priceOracle.abiFile);
    data.priceOracleContract = new ethers.Contract(
      priceOracleAddress,
      priceOracleAbi,
      provider,
    );

    // for each asset retrieve a spot price that will be used when computing statistics
    const tokenAddressesList = tokenAddresses.map((token) => token[1]);
    // the spot prices given by the Aave price oracle are in 'ETH wei' units
    const denominatorWei = (new BigNumber(10)).pow(18);
    const spotPricesScaledEth = {};
    // request all of the prices for the assets in tokenAddressesList from the price oracle
    const spotPricesEth = await data.priceOracleContract.getAssetsPrices(tokenAddressesList);
    // iterate over each price, correlate it with its associated asset token, and scale the price
    spotPricesEth.forEach((price, index) => {
      spotPricesScaledEth[tokenAddressesList[index]] = parseFloat(
        (new BigNumber(price.toString())).div(denominatorWei),
      );
    });

    // parse the csv file specified in the config file and calculate mean, standard deviation,
    // and variance
    const {
      mean, stdDev, variance, numDataPoints,
    } = await parseCsvAndCompute(config.dataSet, data.tokenInfo, spotPricesScaledEth);
    data.mean = mean;
    data.stdDev = stdDev;
    data.variance = variance;
    data.numDataPoints = numDataPoints;
    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    // check for FlashLoan event, if found then check to see if value is a statistical anomaly given
    // the current mean + standard deviation (i.e. 3 std deviations or more larger than mean), if so
    // return a finding, finally re-calculate mean and standard deviation
    const {
      protocolName,
      protocolAbbreviation,
      developerAbbreviation,
      lendingPoolAddress,
      flashLoanSignature,
      tokenInfo,
      priceOracleContract,
      type,
      severity,
    } = data;

    let {
      mean,
      stdDev,
      variance,
      numDataPoints,
    } = data;

    const parsedLogs = txEvent.filterLog(flashLoanSignature, lendingPoolAddress);
    const findings = (await Promise.all(parsedLogs.map(async (log) => {
      const finding = [];
      // scale the found premium using the decimals value in tokenInfo
      const denominator = (new BigNumber(10)).pow(tokenInfo[log.args.asset]);
      const scaledPremium = parseFloat(
        (new BigNumber(log.args.premium.toString())).div(denominator),
      );

      // query the price oracle for the current price of the token asset in ETH
      const ethDenominator = (new BigNumber(10)).pow(18);
      let tokenPriceEth = await priceOracleContract.getAssetPrice(log.args.asset);
      tokenPriceEth = parseFloat((new BigNumber(tokenPriceEth.toString())).div(ethDenominator));

      const scaledPremiumInEth = scaledPremium * tokenPriceEth;
      // if the scaled premium (in eth) of the flash loan is greater than the
      // mean + 3 standard deviations generate a finding
      if (scaledPremiumInEth > (mean + (3 * stdDev))) {
        const loanInfo = {
          tokenAsset: log.args.asset,
          tokenPriceEth,
          premiumEth: scaledPremiumInEth,
        };

        finding.push(createAlert(
          protocolName,
          protocolAbbreviation,
          developerAbbreviation,
          type,
          severity,
          loanInfo,
        ));
      }

      // update the statistics with the new value
      ({
        mean, stdDev, variance, numDataPoints,
      } = calculateStatistics(mean, variance, numDataPoints, scaledPremiumInEth));
      /* eslint-disable no-param-reassign */
      data.mean = mean;
      data.stdDev = stdDev;
      data.variance = variance;
      data.numDataPoints = numDataPoints;
      /* eslint-enable no-param-reassign */

      return finding;
    }))).flat();

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
};
