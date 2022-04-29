const BigNumber = require('bignumber.js');
const RollingMath = require('rolling-math');
const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const { provideInitialize, initializeData } = require('./agent-setup');

// helper function to create alerts
function createAlert(metadata, initData) {
  const { developerAbbrev, protocolName, protocolAbbrev } = initData;
  const {
    field, reserve, observation, average,
  } = metadata;

  return Finding.fromObject({
    name: `Anomalous ${protocolName} ${field} change`,
    description: `Reserve ${reserve} had a large change in ${field}`,
    alertId: `${developerAbbrev}-${protocolAbbrev}-TVL`,
    severity: FindingSeverity.High,
    type: FindingType.Suspicious,
    metadata: {
      field,
      reserve,
      observation: observation.toString(),
      average: average.toString(),
    },
  });
}

// parses and returns data in a usable format
async function parseData(dataPromise, reserve, dataFields) {
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

function provideHandleBlock(data) {
  return async function handleBlock(blockEvent) {
    const {
      lendingPoolContract,
      dataProviderContract,
      dataFields,
      rollingLiquidityData,
      windowSize,
      numStdDeviations,
      minElements,
    } = data;
    const findings = [];

    // override block number so we get data from the block in question
    const override = { blockTag: blockEvent.blockNumber };

    // get reserves and the current liquidity from this block
    const reserves = await lendingPoolContract.getReservesList({ ...override });

    // create array containing a promise that returns the data for each reserve
    const reserveDataPromises = reserves.map(async (reserve) => {
      try {
        // RPC call per reserve data
        const promise = dataProviderContract.getReserveData(reserve, { ...override });
        return await parseData(promise, reserve, dataFields);
      } catch (error) {
        console.error(error);
        return [];
      }
    });

    const resolved = (await Promise.all(reserveDataPromises)).flat();

    // process the data
    resolved.forEach((reserveData) => {
      const { reserve } = reserveData;

      // initialize the rolling math libraries if they don't exist
      if (!rollingLiquidityData[reserve]) {
        rollingLiquidityData[reserve] = {};
        dataFields.forEach((field) => {
          rollingLiquidityData[reserve][field] = new RollingMath(windowSize);
        });
      }

      // loop over data
      dataFields.forEach((field) => {
        const observation = new BigNumber(reserveData[field].toHexString());
        const pastData = rollingLiquidityData[reserve][field];

        // only process data for alerts if we have seen a significant number of blocks
        if (pastData.getNumElements() > minElements) {
          const average = pastData.getAverage();
          const standardDeviation = pastData.getStandardDeviation();

          const limit = standardDeviation.times(numStdDeviations);
          const delta = observation.minus(average).absoluteValue();

          // alert on differences larger than our limit
          if (delta.isGreaterThan(limit)) {
            const metadata = {
              field, reserve, observation, average,
            };
            findings.push(createAlert(metadata, data));
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
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeData),
};
