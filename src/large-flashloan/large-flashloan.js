const ethers = require('ethers');
const BigNumber = require('bignumber.js');
const { getJsonRpcUrl } = require('forta-agent');

// get createAlert and dataFields
const { createAlert } = require('./common');

// load required shared types
const contractAddresses = require('../../contract-addresses.json');

const { LendingPool: lendingPoolAddr, ProtocolDataProvider: dataProviderAddr } = contractAddresses;
const { abi: IERC20Abi } = require('../../abi/IERC20.json');
const { abi: ILendingPoolAbi } = require('../../abi/ILendingPool.json');

const IERC20 = new ethers.utils.Interface(IERC20Abi);
const ILendingPool = new ethers.utils.Interface(ILendingPoolAbi);

const transfer = IERC20.getEvent('Transfer');
const flashLoan = ILendingPool.getEvent('FlashLoan');

const transferTopic = IERC20.getEventTopic(transfer);
const flashLoanTopic = ILendingPool.getEventTopic(flashLoan);

/*
// get config settings
const {
  totalValueAndLiquidity: rawConfig,
} = require('../../agent-config.json');
*/

// set up RPC provider
const provider = new ethers.providers.getDefaultProvider(getJsonRpcUrl());

// set up handle to Aave's LendingPool contract
const lendingPoolContract = new ethers.Contract(lendingPoolAddr, ILendingPoolAbi, provider);

function provideHandleTransaction() {
  return async function handleTransaction(txEvent) {
    const findings = [];

    const transfers = [];
    const flashLoans = [];

    // if aave is not involved it doesn't affect us
    if (!txEvent.addresses[lendingPoolAddr]) return findings;

    txEvent.logs.forEach((log) => {
      // if you do not know which contract the event log was generated from, it is not safe to only
      // match on the topic alone since there may be a different number of indexed arguments
      try {
        switch (log.topics[0]) {
          case transferTopic:
            transfers.push({ parsed: IERC20.parseLog(log), log });
            console.log('got transfer topic!');
            break;
          case flashLoanTopic:
            flashLoans.push({ parsed: ILendingPool.parseLog(log), log });
            console.log('got flashloan topic!');
            break;
          default:
            break;
        }
      } catch(e) {}
    });

    if (flashLoans.length === 0) return findings;
    console.log(transfers);
    console.log(flashLoans);

    const balances = {};

    transfers.forEach();


    const logs = txEvent.logs.filter();


    // rip out
    const aaveLogs = logs.filter((log) => log.address === lendingPoolAddr);

    // override block number so we get data from the block in question
    const override = { blockTag: blockEvent.blockNumber };

  };
}

// exports
module.exports = {
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(),
};
