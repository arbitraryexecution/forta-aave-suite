import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import {
  BlockEvent,
  Finding,
  HandleBlock,
  FindingSeverity,
  FindingType,
  getJsonRpcUrl,
} from 'forta-agent';
import RollingMath from 'rolling-math';

// load required shared types
import { LendingPool } from '../../contract-addresses.json';
import { ILendingPool__factory } from '../../contracts/factories/ILendingPool__factory';

// create rolling math object structure
const rollingEventData: { [address: string] : RollingMath; } = {};

// helper function to create alerts
function createAlert(assetAddress: string, delta: BigNumber, limit: BigNumber): Finding {
  return Finding.fromObject({
    name: 'Stale AAVE Reserve Data',
    description: `Asset address: ${assetAddress}`,
    alertId: 'AE-AAVE-STALE-RESERVE-DATA',
    severity: FindingSeverity.Medium,
    type: FindingType.Suspicious,
    everestId: '',
    metadata: {
      assetAddress,
      delta: delta.toString(),
      limit: limit.toString(),
    },
  });
}

const handleBlock: HandleBlock = async (blockEvent: BlockEvent) => {
  const findings: Finding[] = [];

  // get the timestamp for the current block
  const blockTimestamp = new BigNumber(blockEvent.block.timestamp);

  // set up a provider using the JSON-RPC URL injected by the scan node
  // (in development, this is specified in the config file)
  const provider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());

  // set up a contract so we can call the necessary method(s)
  const aaveContract = ILendingPool__factory.connect(LendingPool, provider);

  // get an array of all of the active reserves addresses
  // ref: https://docs.aave.com/developers/the-core-protocol/lendingpool#getreserveslist
  const assetAddresses = await aaveContract.getReservesList();

  // iterate over all of the reserves to collect data
  // cannot use forEach here: https://stackoverflow.com/a/37576787
  await Promise.all(assetAddresses.map(async (assetAddress) => {
    // use the contract instance to get the timestamp for when the reserve was last updated
    // ref: https://docs.aave.com/developers/the-core-protocol/lendingpool#getreservedata
    const { lastUpdateTimestamp } = await aaveContract.getReserveData(assetAddress);

    // calculate the time difference between the current block and the last reserve update
    const diff = new BigNumber(lastUpdateTimestamp).minus(blockTimestamp);

    if (!rollingEventData[assetAddress]) {
      rollingEventData[assetAddress] = new RollingMath(100);
    } else {
      // if we have seen this before, check for anomalous value
      const average = rollingEventData[assetAddress].getAverage() as BigNumber;
      const standardDeviation = rollingEventData[assetAddress].getStandardDeviation() as BigNumber;

      // limit is 3 standard deviations (~99.7%)
      const limit = average.plus(standardDeviation.times(0.1));
      const delta = diff.minus(average).absoluteValue();

      // if instance is outside the standard deviation, report
      if (delta.isGreaterThan(limit)) {
        findings.push(createAlert(assetAddress, delta, limit));
      }
    }

    // update rolling data
    rollingEventData[assetAddress].addElement(diff);
  }));
  return findings;
};

export default {
  handleBlock,
};
