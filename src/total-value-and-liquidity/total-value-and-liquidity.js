const ethers = require('ethers');
const BigNumber = require('bignumber.js');
const { getJsonRpcUrl } = require('forta-agent');
const RollingMathLib = require('rolling-math');

// get createAlert and dataFields
const { createAlert, dataFields } = require('./common');

// load required shared types
const contractAddresses = require('../../contract-addresses.json');

const { LendingPool: lendingPoolAddr, ProtocolDataProvider: dataProviderAddr } = contractAddresses;
const { abi: DataAbi } = require('../../abi/AaveProtocolDataProvider.json');
const { abi: LendingPoolAbi } = require('../../abi/ILendingPool.json');

// get config settings
const {
  totalValueAndLiquidity: rawConfig,
} = require('../../agent-config.json');

// set up RPC provider
const provider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());

// set up handle to Aave's LendingPool contract
const lendingPoolContract = new ethers.Contract(lendingPoolAddr, LendingPoolAbi, provider);
const dataProviderContract = new ethers.Contract(dataProviderAddr, DataAbi, provider);

// create rolling math object structure
let rollingLiquidityData = {};

// parses and returns data in a usable format
async function parseData(dataPromise, reserve) {
  // settle our rpc call
  const data = await dataPromise;

  // calculate totals
  const totalDebt = data.totalStableDebt.add(data.totalVariableDebt);
  const totalValueLocked = totalDebt.add(data.availableLiquidity);

  // create object with data to return
  const parsedData = {};
  dataFields.forEach((field) => {
    parsedData[field] = data[field];
  });

  // add our custom fields
  parsedData.reserve = reserve;
  parsedData.totalDebt = totalDebt;
  parsedData.totalValueLocked = totalValueLocked;

  return parsedData;
}

function provideHandleBlock(RollingMath, config, lendingPool, dataProvider) {
  rollingLiquidityData = {};

  return async function handleBlock(blockEvent) {
    const findings = [];

    // override block number so we get data from the block in question
    const override = { blockTag: blockEvent.blockNumber };

    // get reserves and the current liquidity from this block
    const reserves = await lendingPool.getReservesList({ ...override });

    // create array containing a promise that returns the data for each reserve
    const reserveData = [];
    reserves.forEach((reserve) => {
      // RPC call for per reserve data
      const dataPromise = dataProvider.getReserveData(reserve, { ...override });
      reserveData.push(
        parseData(dataPromise, reserve).catch(() => undefined),
      );
    });

    // resolve our requests
    const resolved = (await Promise.all(reserveData)).filter(
      (result) => result !== undefined,
    );

    // process the data
    resolved.forEach((data) => {
      const { reserve } = data;

      // initialize the rolling math libraries if they don't exist
      if (!rollingLiquidityData[reserve]) {
        rollingLiquidityData[reserve] = {};
        dataFields.forEach((field) => {
          rollingLiquidityData[reserve][field] = new RollingMath(config.windowSize);
        });
      }

      // loop over data
      dataFields.forEach((field) => {
        const observation = new BigNumber(data[field].toHexString());
        const pastData = rollingLiquidityData[reserve][field];

        // only process data for alerts if we have seen a significant number of blocks
        if (pastData.getNumElements() > config.minElements) {
          const average = pastData.getAverage();
          const standardDeviation = pastData.getStandardDeviation();

          const limit = standardDeviation.times(config.numStds);
          const delta = observation.minus(average).absoluteValue();

          // alert on differences larger than our limit
          if (delta.isGreaterThan(limit)) {
            findings.push(createAlert({
              field, reserve, observation, average,
            }));
          }
        }

        // add observation to our data
        pastData.addElement(observation);
      });
    });

    return findings;
  };
}

// exports
module.exports = {
  provideHandleBlock,
  handleBlock: provideHandleBlock(
    RollingMathLib, rawConfig, lendingPoolContract, dataProviderContract,
  ),
};
