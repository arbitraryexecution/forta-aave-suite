// transaction handlers
const addressWatch = require('./address-watch/address-watch');
const adminEvents = require('./admin-events/admin-events');
const anomalousValue = require('./anomalous-value/anomalous-value');
const newContract = require('./new-contract-interaction/new-contract-interaction');

// block handlers
const oracleToFallback = require('./compare-oracle-to-fallback/compare-oracle-to-fallback');
const reserveUpdate = require('./check-reserve-update-frequency/check-reserve-update-frequency');
const reserveWatch = require('./reserve-watch/reserve-watch');
const tvlLiquidity = require('./total-value-and-liquidity/total-value-and-liquidity');

// transaction handlers
const txHandlers = [
  addressWatch,
  adminEvents,
  anomalousValue,
  newContract,
];

// block handlers
const blockHandlers = [
  oracleToFallback,
  reserveUpdate,
  reserveWatch,
  tvlLiquidity,
];

// returns findings over all txHandler's handleTransaction functions
function provideHandleTransaction(agents) {
  return async function handleTransaction(txEvent) {
    const findings = (
      await Promise.all(
        agents.map((agent) => agent.handleTransaction(txEvent)),
      )
    ).flat();

    return findings;
  };
}

// returns findings over all blockHandler's handleBlock functions
function provideHandleBlock(agents) {
  return async function handleBlock(blockEvent) {
    const findings = (
      await Promise.all(
        agents.map((agent) => agent.handleBlock(blockEvent)),
      )
    ).flat();

    return findings;
  };
}

// returns a promise of all the async initialize calls
function provideInitialize(agents) {
  return async function initialize() {
    return Promise.all(agents.map(async (agent) => {
      if (typeof agent.initialize === 'function') {
        return agent.initialize();
      }
      return Promise.resolve();
    }));
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize([...txHandlers, ...blockHandlers]),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(txHandlers),
  provideHandleBlock,
  handleBlock: provideHandleBlock(blockHandlers),
};
