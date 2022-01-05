const ethers = require('ethers');

// imports from forta-agent
const {
  TransactionEvent,
  FindingType,
  FindingSeverity,
  Finding,
} = require('forta-agent');

// local definitions
const { LendingPool: address } = require('../../contract-addresses.json');
const { abi } = require('../../abi/ILendingPool.json');
const { handleTransaction } = require('./anomalous-value');

const {
  anomalousValue: config,
  aaveEverestId: AAVE_EVEREST_ID,
} = require('../../agent-config.json');

// create interface
const iface = new ethers.utils.Interface(abi);

// constants for test
const tokenA = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const zeroAddress = ethers.constants.AddressZero;
const zeroHash = ethers.constants.HashZero;

// default empty log structure
const emptyLog = {
  address: zeroHash,
  logIndex: 0,
  blockNumber: 0,
  blockHash: zeroHash,
  transactionIndex: 0,
  transactionHash: zeroHash,
  removed: false,
};

// function to encode default values
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

// creates log with sparse inputs
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
  return new TransactionEvent(null, null, { hash: '0xTEST' }, receipt, [], addresses, null);
}

// tests
describe('aave anomalous value agent', () => {
  describe('handleTransaction', () => {
    it('should not further parse non-aave logs', async () => {
      // create log with address other than aave
      const log = createLog(iface.getEvent('Borrow'),
        { reserve: tokenA, amount: 30000 },
        { address: zeroAddress });

      // build txEvent
      const receipt = createReceipt([log], zeroAddress);
      const txEvent = createTxEvent(receipt, zeroAddress);

      // run agent with txEvent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('should create finding when given a anomalous event', async () => {
      // create log that should be analized
      const largeAmount = 5500000;
      const log = createLog(iface.getEvent('Borrow'),
        { reserve: tokenA, amount: 10000 },
        { address });

      // build txEvent
      const receipt = createReceipt([log, log, log], address);
      const txEvent = createTxEvent(receipt, address);

      // run agent with txEvent, should update averages
      for (let i = 0; i < config.windowSize; i++) {
        // eslint-disable-next-line no-await-in-loop
        const finding = await handleTransaction(txEvent);
        expect(finding).toStrictEqual([]);
      }

      // create anomalous log
      const anomalousLog = createLog(iface.getEvent('Borrow'),
        { reserve: tokenA, amount: largeAmount },
        { address });

      // create anomalous txEvent
      const anomalousReceipt = createReceipt([anomalousLog], address);
      const anomalousTxEvent = createTxEvent(anomalousReceipt, address);

      // create expected finding
      const expectedFinding = Finding.fromObject({
        name: 'High AAVE Borrow Amount',
        description: `Borrow: ${largeAmount}\nToken: ${tokenA}`,
        alertId: 'AE-AAVE-HIGH-TX-AMOUNT',
        severity: FindingSeverity.Medium,
        type: FindingType.Suspicious,
        everestId: AAVE_EVEREST_ID,
        metadata: {
          txHash: '0xTEST',
        },
      });

      // run test
      const anomalousFinding = await handleTransaction(anomalousTxEvent);

      // assertions
      expect(anomalousFinding).toStrictEqual([expectedFinding]);
    });
  });
});
