const BigNumber = require('bignumber.js');

const { checkReserveUpdateFrequency } = require('../../agent-config.json');

const { initializeTokensContracts, createAlert } = require('./agent-setup');

// time threshold over which we trigger alerts (24 hours = 86400 seconds)
// NOTE: this value is imported from the agent-config.json file
// this value comes from the Chainlink web interface for price feeds (mouseover Trigger parameters)
//  'A new trusted answer is written when the off-chain price moves more than the deviation
//   threshold or 86400 seconds have passed since the last answer was written on-chain.'
const ORACLE_AGE_THRESHOLD_SECONDS = checkReserveUpdateFrequency.oracleAgeThresholdSeconds;

function provideHandleBlock(tokensAddressesContractsPromise) {
  return async function handleBlock(blockEvent) {
    const findings = [];

    // settle the promise the first time, all subsequent times just get the resolve() value
    const tokensAddressesContracts = await tokensAddressesContractsPromise;

    // get the timestamp for the current block
    const blockTimestamp = new BigNumber(blockEvent.block.timestamp);

    // override block number so we get data from the block in question
    const override = { blockTag: blockEvent.blockNumber };

    // define the promise function to run for each reserve token
    async function checkOracleAge(tokenAddressContract) {
      const { reserveToken, priceSourceAddress, priceSourceContract } = tokenAddressContract;

      // get the timestamp from the price source contract
      let roundData;
      try {
        roundData = await priceSourceContract.latestRoundData({ ...override });
      } catch (error) {
        return;
      }

      // the updatedAt value is of type ethers.BigNumber
      // ethers.BigNumber is not the same as BigNumber from bignumber.js
      // therefore, we need to convert from ethers.BigNumber to BigNumber
      const timestamp = new BigNumber(roundData.updatedAt.toString());

      // calculate the difference between the current block timestamp and the last oracle update
      const oracleAge = blockTimestamp.minus(timestamp);

      if (oracleAge.isGreaterThan(ORACLE_AGE_THRESHOLD_SECONDS)) {
        findings.push(createAlert(reserveToken, oracleAge, priceSourceAddress));
      }
    }

    // for each reserve token, get the price source address and timestamp
    // forEach does not work with async and promises
    // attach a .catch() method to each promise to prevent any rejections from causing Promise.all
    // from failing fast
    await Promise.all(tokensAddressesContracts.map(
      (tokenAddressContract) => checkOracleAge(
        tokenAddressContract,
      ).catch((error) => console.error(error)),
    ));

    return findings;
  };
}

module.exports = {
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeTokensContracts()),
};
