// imports from forta-agent
const {
  TransactionEvent, FindingType, FindingSeverity, Finding, ethers,
} = require('forta-agent');

const { provideHandleTransaction, provideInitialize } = require('./agent');
const { getAbi } = require('./utils');

// pull information from config file which will be used for testing
const {
  contract: {
    LendingPool: {
      address,
      windowSize,
      abiFile,
    },
  },
} = require('../bot-config.json');

const abi = getAbi(abiFile);
const iface = new ethers.utils.Interface(abi);

// constants for test
const tokenA = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const zeroAddress = ethers.constants.AddressZero;

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
  const log = { ...logArgs };

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
 * TransactionEvent(type, network, transaction, traces, addresses, block, logs, contractAddress)
 */
function createTxEvent({ logs, addresses }) {
  return new TransactionEvent(null, null, null, [], [], null, logs, addresses);
}

// tests
describe('aave anomalous value agent', () => {
  let initializeData;
  let handleTransaction;

  beforeEach(async () => {
    initializeData = {};

    // initialize the handler
    await (provideInitialize(initializeData))();
    handleTransaction = provideHandleTransaction(initializeData);
  });

  describe('handleTransaction', () => {
    it('should not further parse non-aave logs', async () => {
      // create log with address other than aave
      const log = createLog(iface.getEvent('Borrow'),
        { reserve: tokenA, amount: 30000 },
        { address: zeroAddress });

      // build txEvent
      const txEvent = createTxEvent({
        logs: [log],
        addresses: { [zeroAddress]: true },
      });

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
      const txEvent = createTxEvent({
        logs: [log],
        addresses: { [address]: true },
      });

      // run agent with txEvent, should update averages
      for (let i = 0; i < windowSize; i++) {
        // eslint-disable-next-line no-await-in-loop
        const finding = await handleTransaction(txEvent);
        expect(finding).toStrictEqual([]);
      }

      // create anomalous log
      const anomalousLog = createLog(iface.getEvent('Borrow'),
        { reserve: tokenA, amount: largeAmount },
        { address });

      // create anomalous txEvent
      const anomalousTxEvent = createTxEvent({
        logs: [anomalousLog],
        addresses: { [address]: true },
      });

      // create expected finding
      const expectedFinding = Finding.fromObject({
        name: 'Aave High Borrow Amount',
        description: `A transaction utilized a large amount of ${tokenA}`,
        alertId: 'AE-AAVE-HIGH-TX-AMOUNT',
        severity: FindingSeverity.Medium,
        type: FindingType.Suspicious,
        metadata: {
          event: 'Borrow',
          amount: `${largeAmount}`,
          token: tokenA,
        },
      });

      // run test
      const anomalousFinding = await handleTransaction(anomalousTxEvent);

      // assertions
      expect(anomalousFinding).toStrictEqual([expectedFinding]);
    });
  });
});
