import { ethers} from "ethers";
import BigNumber from 'bignumber.js';
import {
  BlockEvent,
  Finding,
  HandleBlock,
  FindingSeverity,
  FindingType,
  getJsonRpcUrl,
} from 'forta-agent';
import RollingMath from "rolling-math";

// load required shared types
const { LendingPool: AAVE_V2_ADDRESS } = require('../../contract-addresses.json');
const { abi } = require('../../interfaces/ILendingPool.json');

// create rolling math object structure
const rollingEventData = {};

// helper function to create alerts
function createAlert(assetAddress, delta, limit) {
  return Finding.fromObject({
    name: 'Stale AAVE Reserve Data',
    description: 'Asset address: ${assetAddress.toString()}',
    alertId: 'AE-AAVE-STALE-RESERVE-DATA',
    severity: FindingSeverity.Medium,
    type: FindingType.Suspicious,
    everestId: '',
    metadata: {
      assetAddress,
      delta: delta.toString(),
      limit: limit.toString()
    },
  });
}


const handleBlock: HandleBlock = async (blockEvent: BlockEvent) => {
  const findings: Finding[] = [];

  // get the timestamp for the current block
  const blockTimestamp = new BigNumber(blockEvent.block.timestamp);

  // set up a provider using the JSON-RPC URL injected by the scan node (in development, this is specified in the config file)
  const provider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());

  // set up a contract so we can call the necessary method(s)
  const contractInstance = new ethers.Contract(AAVE_V2_ADDRESS, abi, provider);

  // get an array of all of the active reserves addresses
  // ref: https://docs.aave.com/developers/the-core-protocol/lendingpool#getreserveslist
  const assetAddresses = await contractInstance.getReservesList();

  // iterate over all of the reserves to collect data
  assetAddresses.forEach((assetAddress) => {

    // use the contract instance to get the timestamp for when the reserve was last updated
    // ref: https://docs.aave.com/developers/the-core-protocol/lendingpool#getreservedata
    const { lastUpdateTimestamp } = await contractInstance.getReserveData(assetAddress);

    // calculate the time difference between the current block and the last reserve update
    const diff = new BigNumber(lastUpdateTimestamp).minus(blockTimestamp);
   
    if (!rollingEventData[assetAddress]) {
      rollingEventData[assetAddress] = new RollingMath(100);
    }
    else {
      // if we have seen this before, check for anomalous value
      const average = rollingEventData[assetAddress].getAverage();
      const standardDeviation = rollingEventData[assetAddress].getStandardDeviation();

      // limit is 3 standard deviations (~99.7%)
      const limit = average.plus(standardDeviation.times(3));
      const delta = diff.minus(average).absoluteValue();

      // if instance is outside the standard deviation, report
      if (delta.isGreaterThan(limit)) {
        findings.push(createAlert(assetAddress, delta, limit));
      }
    }

    // update rolling data
    rollingEventData[assetAddress].addElement(diff);
  }
  return findings;
}

export default {
  handleBlock,
};
