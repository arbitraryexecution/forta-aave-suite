const fs = require('fs');
const csv = require('csv-parser');
const BigNumber = require('bignumber.js');

// helper function for importing a file located in the abi/ folder given its name
function getAbi(abiName) {
  // eslint-disable-next-line global-require,import/no-dynamic-require
  const { abi } = require(`../abi/${abiName}`);
  return abi;
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
    newMean = ((currMean.times(currNumDataPoints)).plus(newValue)).div(newNumDataPoints);
    const newDataPoint = (newValue.minus(newMean)).times(newValue.minus(currMean));
    newVariance = ((currVariance.times(currNumDataPoints)).plus(newDataPoint)).div(newNumDataPoints);
    newStdDev = newVariance.sqrt();
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
    let denominator;
    let tokenPrice;
    const denominators = {};
    const tokenPrices = {};
    const premiumsInEth = [];

    fs.createReadStream(`${__dirname}/${csvFileName}`)
      .pipe(csv())
      .on('data', (data) => {
        // scale the premium for each row of data in the CSV file by the given asset's decimals
        denominator = denominators[data.asset];
        if (denominator === undefined) {
          denominator = new BigNumber(10).pow(tokenInfo[data.asset]);
          denominators[data.asset] = denominator;
        }

        tokenPrice = tokenPrices[data.asset];
        if (tokenPrice === undefined) {
          tokenPrice = new BigNumber(tokenPriceInfo[data.asset]);
          tokenPrices[data.asset] = tokenPrice;
        }

        const scaledPremium = new BigNumber(data.premium).div(denominator);
        const premiumInEth = scaledPremium.times(tokenPrice);
        premiumsInEth.push(premiumInEth);
      })
      .on('end', () => {
        const numDataPoints = premiumsInEth.length;
        const mean = BigNumber.sum(...premiumsInEth).div(numDataPoints);
        const squaredDifferences = premiumsInEth.map((sample) => sample.minus(mean).pow(2));
        const variance = BigNumber.sum(...squaredDifferences).div(numDataPoints);
        const stdDev = variance.sqrt();
        resolve({
          mean, stdDev, variance, numDataPoints,
        });
      })
      .on('error', () => reject());
  });
}

module.exports = {
  getAbi,
  calculateStatistics,
  parseCsvAndCompute,
};
