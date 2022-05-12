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

module.exports = {
  getAbi,
  calculateStatistics,
  parseCsvAndCompute,
};
