const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const BigNumber = require('bignumber.js');

const { ORACLE_AGE_THRESHOLD_SECONDS, initializeData, provideInitialize } = require('./bot-setup');

// helper function to create alerts
function createAlert(
  developerAbbrev, protocolName, protocolAbbrev, reserveToken, oracleAge, priceSourceAddress,
) {
  return Finding.fromObject({
    name: `${protocolName} Stale Price Oracle Data for ${reserveToken.symbol}`,
    description: `Token ${reserveToken.symbol} Price Oracle Age: ${oracleAge} seconds`,
    alertId: `${developerAbbrev}-${protocolAbbrev}-PRICE-ORACLE-STALE`,
    severity: FindingSeverity.Medium,
    type: FindingType.Degraded,
    metadata: {
      symbol: reserveToken.symbol,
      tokenAddress: reserveToken.tokenAddress,
      oracleAge,
      priceSourceAddress,
    },
  });
}

// helper function that checks the oracle age of the passed-in reserve token
async function checkOracleAge(tokenAddressContract, override, blockTimestamp, data) {
  const { reserveToken, priceSourceAddress, priceSourceContract } = tokenAddressContract;

  // get the timestamp from the price source contract
  const roundData = await priceSourceContract.latestRoundData({ ...override });

  // the updatedAt value is of type ethers.BigNumber
  // ethers.BigNumber is not the same as BigNumber from bignumber.js
  // therefore, we need to convert from ethers.BigNumber to BigNumber
  const timestamp = new BigNumber(roundData.updatedAt.toString());

  // calculate the difference between the current block timestamp and the last oracle update
  const oracleAge = blockTimestamp.minus(timestamp);

  // return a finding if the oracle update age is greater than ORACLE_AGE_THRESHOLD_SECONDS
  if (oracleAge.isGreaterThan(ORACLE_AGE_THRESHOLD_SECONDS)) {
    const { developerAbbrev, protocolName, protocolAbbrev } = data;
    return createAlert(
      developerAbbrev, protocolName, protocolAbbrev, reserveToken, oracleAge, priceSourceAddress,
    );
  }

  return [];
}

function provideHandleBlock(data) {
  return async function handleBlock(blockEvent) {
    const { tokenAddressContractTuples: tokensAddressesContracts } = data;

    // get the timestamp for the current block
    const blockTimestamp = new BigNumber(blockEvent.block.timestamp);

    // override block number so we get data from the block in question
    const override = { blockTag: blockEvent.blockNumber };

    // for each reserve token, get the price source address and timestamp
    // forEach does not work with async and promises
    // attach a .catch() method to each promise to prevent any rejections from causing Promise.all
    // from failing fast
    const promises = tokensAddressesContracts.map(async (tokenAddressContract) => {
      try {
        return await checkOracleAge(tokenAddressContract, override, blockTimestamp, data);
      } catch (error) {
        console.error(error);
        return [];
      }
    });

    const findings = (await Promise.all(promises)).flat();
    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeData),
};
