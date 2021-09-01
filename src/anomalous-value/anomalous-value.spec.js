const ethers = require('ethers');

const {
  TransactionEvent,
  FindingType,
  FindingSeverity,
  Finding,
} = require('forta-agent');

// local definitions
const { LendingPool : address } = require('../../contract-addresses.json');

const { abi } = require('../../interfaces/ILendingPool.json');
const { handleTransaction } = require('./anomalous-value.js');

// create interface
const iface = new ethers.utils.Interface(abi);

// constants for test
const tokenA = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const zeroAddress = ethers.constants.AddressZero;
const zeroHash = ethers.constants.HashZero;
// const eventNames = ['Borrow', 'Deposit', 'Repay', 'Withdraw'];

const emptyLog = {
  address: zeroHash,
  logIndex: 0,
  blockNumber: 0,
  blockHash: zeroHash,
  transactionIndex: 0,
  transactionHash: zeroHash,
  removed: false,
};

function defaultType(type) {
  switch (type) {
    case 'address':
      return zeroAddress;
    case 'bool':
      return false;
    case 'string':
      return '';
    case 'bytes':
      return '';
    case 'array':
      throw new Error('array not implemented');
    case 'tuple':
      throw new Error('tuple not implemented');
    default:
      return 0;
  }
}

// creates log with sparce inputs
function createLog(eventAbi, inputArgs, logArgs) {
  const topics = [];
  const dataTypes = [];
  const dataValues = [];

  // initialize default log and assign passed in values
  const log = { ...emptyLog, ...logArgs };

  // build topics and data fields
  topics.push(ethers.utils.Interface.getEventTopic(eventAbi));

  // parse each input, save into topic or data depending on indexing, may
  // have to skip if param._isParamType is false, does not support dynamic types
  eventAbi.inputs.forEach((param) => {
    const { type } = param;
    const data = inputArgs[param.name] || defaultType(type);
    if (param.indexed) {
      topics.push(ethers.utils.defaultAbiCoder.encode([type], [data]));
    } else {
      dataTypes.push(type);
      dataValues.push(data);
    }
  });

  // assign topic and data
  log.topics = topics;
  log.data = ethers.utils.defaultAbiCoder.encode(dataTypes, dataValues);

  return log;
}

/**
 * Log(address, topics, data, logIndex, blockNumber, blockHash, transactionIndex,
 * transactionHash, removed)
 *
 * Receipt(status, root, gasUsed, cumulativeGasUsed, logsBloom, logs, contractAddress
 * blockNumber, blockHash, transactionIndex, transactionHash)
 */
function createReceipt(logs, contractAddress) {
  return {
    status: null,
    root: null,
    gasUsed: null,
    cumulativeGasUsed: null,
    logsBloom: null,
    logs,
    contractAddress,
    blockHash: null,
    transactionIndex: null,
    transactionHash: null,
    blockNumber: null,
  };
}

/**
 * TransactionEvent(type, network, transaction, receipt, traces, addresses, block)
 */
function createTxEvent(receipt, addresses) {
  return new TransactionEvent(null, null, null, receipt, [], addresses, null);
}

// tests
describe('aave anomolous value agent', () => {
  describe('handleTransaction', () => {
    it('should not further parse non-aave logs', async () => {
      const log = createLog(iface.getEvent('Borrow'),
        { reserve: tokenA, amount: 30000 },
        { address: zeroAddress });

      const receipt = createReceipt([log], zeroAddress);
      const txEvent = createTxEvent(receipt, zeroAddress);

      const findings = await handleTransaction(txEvent);

      expect(findings).toStrictEqual([]);
    });

    it('should create finding when given a anomolous event', async () => {
      const largeAmount = 5500000;
      const log = createLog(iface.getEvent('Borrow'),
        { reserve: tokenA, amount: 10000 },
        { address });

      const receipt = createReceipt([log, log, log], zeroAddress);
      const txEvent = createTxEvent(receipt, zeroAddress);

      const finding = await handleTransaction(txEvent);
      expect(finding === []);

      const anomolousLog = createLog(iface.getEvent('Borrow'),
        { reserve: tokenA, amount: largeAmount },
        { address });

      const anomolousReceipt = createReceipt([anomolousLog], zeroAddress);
      const anomolousTxEvent = createTxEvent(anomolousReceipt, zeroAddress);

      const parsedLog = iface.parseLog(anomolousLog);
      const expectedFinding = Finding.fromObject({
        name: 'High AAVE Borrow Amount',
        description: `Borrow: ${largeAmount}\nToken: ${tokenA}`,
        alertId: 'AAVE-1',
        severity: FindingSeverity.Medium,
        type: FindingType.Suspicious,
        metadata: JSON.stringify(parsedLog),
      });

      const anomolousFinding = await handleTransaction(anomolousTxEvent);
      expect(anomolousFinding === expectedFinding);
    });
  });
});
