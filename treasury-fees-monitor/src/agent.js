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
  let newMean = new BigNumber(0);
  let newStdDev = new BigNumber(0);
  let newVariance = new BigNumber(0);
  let newNumDataPoints = currNumDataPoints.plus(1);

  if (currNumDataPoints === 0) {
    newMean = newValue;
    newNumDataPoints = new BigNumber(1);
  } else {
    newMean = (currMean.times(currNumDataPoints.div(newNumDataPoints)))
      .plus(newValue.div(newNumDataPoints));
    newVariance = (
      (currVariance.times(currNumDataPoints))
        .plus((newValue.minus(newMean)).times(newValue.minus(currMean)))
    ).div(newNumDataPoints);
    newStdDev = newVariance.sqrt();
  }

  return {
    mean: newMean,
    stdDev: newStdDev,
    variance: newVariance,
    numDataPoints: newNumDataPoints,
  };
}

async function parseAndCompute(csvFileName, tokenInfo) {
  return new Promise((resolve, reject) => {
    let mean = new BigNumber(0);
    let stdDev = new BigNumber(0);
    let variance = new BigNumber(0);
    let numDataPoints = new BigNumber(0);

    fs.createReadStream(`${__dirname}/${csvFileName}`)
      .pipe(csv())
      .on('data', (data) => {
        // scale the premium for each row of data in the CSV file by the given asset's decimals
        const denominator = (new BigNumber(10)).pow(tokenInfo[data.asset]);
        const scaledPremium = (new BigNumber(data.premium)).div(denominator);
        ({
          mean, stdDev, variance, numDataPoints,
        } = calculateStatistics(mean, variance, numDataPoints, scaledPremium));
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

    // parse the csv file specified in the config file and calculate mean, standard deviation,
    // and variance
    const {
      mean, stdDev, variance, numDataPoints,
    } = await parseAndCompute(config.dataSet, data.tokenInfo);
    console.log(mean.toString());
    console.log(stdDev.toString());
    console.log(variance.toString());
    console.log(numDataPoints.toString());
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
