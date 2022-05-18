const {
  Finding, createTransactionEvent, TransactionEvent, ethers, FindingType, FindingSeverity,
} = require('forta-agent');

const { provideHandleTransaction, provideInitialize } = require('./agent');
const { getAbi } = require('./utils');
const { createMockEventLogs, getObjectsFromAbi } = require('./test-utils');

const config = require('../bot-config.json');

const MINIMUM_EVENT_LIST = [
  'ProposalCreated',
  'ProposalCanceled',
  'ProposalExecuted',
];

/**
 * TransactionEvent(type, network, transaction, traces, addresses, block, logs, contractAddress)
 */
function createTxEvent({ logs, addresses }) {
  return new TransactionEvent(null, null, null, [], [], null, logs, addresses);
}

// check the configuration file to verify the values
describe('check bot configuration file', () => {
  it('procotolName key required', () => {
    const { protocolName } = config;
    expect(typeof (protocolName)).toBe('string');
    expect(protocolName).not.toBe('');
  });

  it('protocolAbbreviation key required', () => {
    const { protocolAbbreviation } = config;
    expect(typeof (protocolAbbreviation)).toBe('string');
    expect(protocolAbbreviation).not.toBe('');
  });

  it('developerAbbreviation key required', () => {
    const { developerAbbreviation } = config;
    expect(typeof (developerAbbreviation)).toBe('string');
    expect(developerAbbreviation).not.toBe('');
  });

  it('contracts key required', () => {
    const { contracts } = config;
    expect(typeof (contracts)).toBe('object');
    expect(contracts).not.toBe({});
  });

  it('contracts key values must be valid', () => {
    const firstContractName = Object.keys(config.contracts)[0];
    const { abiFile, address } = config.contracts[firstContractName];

    // check that the address is a valid address
    expect(ethers.utils.isHexString(address, 20)).toBe(true);

    // load the ABI from the specified file
    // the call to getAbi will fail if the file does not exist
    const abi = getAbi(abiFile);

    // extract all of the event names from the ABI
    const events = getObjectsFromAbi(abi, 'event');

    // verify that at least the minimum list of supported events are present
    MINIMUM_EVENT_LIST.forEach((eventName) => {
      if (Object.keys(events).indexOf(eventName) === -1) {
        throw new Error(`ABI does not contain minimum supported event: ${eventName}`);
      }
    });
  });
});

const firstContractName = Object.keys(config.contracts)[0];
const firstContract = config.contracts[firstContractName];
const abi = getAbi(firstContract.abiFile);

const invalidEvent = {
  anonymous: false,
  inputs: [
    {
      indexed: false,
      internalType: 'uint256',
      name: 'testValue',
      type: 'uint256',
    },
  ],
  name: 'TESTMockEvent',
  type: 'event',
};
// push fake event to abi before creating the interface
abi.push(invalidEvent);
const iface = new ethers.utils.Interface(abi);


// tests
describe('monitor governance contracts for emitted events', () => {
  describe('handleTransaction', () => {
    let initializeData;
    let handleTransaction;
    let mockTxEvent;

    // constants
    const mockContractName = 'mockContractName';
    const mockContractAddress = ethers.utils.hexZeroPad('0x1', 20);
    const mockEventSignature = 'event mockEvent()';
    const iface = new ethers.utils.Interface(abi);


    // logs data for test case: address match + no topic match
    const logsNoMatchEvent = [
      {
        address: mockContractAddress,
        topics: [
          ethers.constants.HashZero,
        ],
        data: '0x',
      },
    ];

    // logs data for test case:  no address match + no topic match
    const logsNoMatchAddress = [
      {
        address: ethers.constants.AddressZero,
        topics: [
          ethers.constants.HashZero,
        ],
        data: '0x',
      },
    ];

    beforeEach(async () => {
      initializeData = {};

      // initialize the handler
      await (provideInitialize(initializeData))();
      handleTransaction = provideHandleTransaction(initializeData);

      validContractAddress = firstContract.address;


      // initialize mock transaction event with default values
      mockTxEvent = createTransactionEvent({
        receipt: {
          logs: [
            {
              name: '',
              address: '',
              signature: '',
              topics: [],
              data: `0x${'0'.repeat(1000)}`,
              args: [],
            },
          ],
        },
      });
    });

    it('returns empty findings if contract address does not match', async () => {
      // build txEvent
      const txEvent = createTxEvent({
        logs: logsNoMatchAddress,
        addresses: { [ethers.constants.AddressZero]: true },
      });

      // run bot
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if contract address matches but not event', async () => {
      // build tx event
      const txEvent = createTxEvent({
        logs: logsNoMatchEvent,
        addresses: { [mockContractAddress]: true },
      });

      // run bot
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns findings if contract address matches and ProposalCreated was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi['ProposalCreated'];

      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      let defaultLog = {};
      defaultLog.name = mockContractName;
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.args = mockArgs;
      defaultLog.data = data;
      defaultLog.signature = iface
        .getEvent(validEvent.name)
        .format(ethers.utils.FormatTypes.minimal)
        .substring(6);
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const proposal = {
        id: '0',
        calldatas: '0xff',
        endBlock: '0',
        startBlock: '0',
        targets: ethers.constants.AddressZero,
        creator: ethers.constants.AddressZero,
        signatures: 'test',
      };
      const expectedFinding = Finding.fromObject({
        name: `${config.protocolName} Governance Proposal Created`,
        description: `Governance Proposal ${proposal.id} was just created`,
        alertId: `${config.developerAbbreviation}-${config.protocolAbbreviation}-PROPOSAL-CREATED`,
        type: 'Info',
        severity: 'Info',
        protocol: config.protocolName,
        metadata: {
          address: validContractAddress,
          ...proposal,
        },
      });

      expect(findings).toStrictEqual([expectedFinding]);
    });

    it('returns findings if contract address matches and ProposalCanceled was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi['ProposalCanceled'];

      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      let defaultLog = {};
      defaultLog.name = mockContractName;
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.args = mockArgs;
      defaultLog.data = data;
      defaultLog.signature = iface
        .getEvent(validEvent.name)
        .format(ethers.utils.FormatTypes.minimal)
        .substring(6);
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const proposal = {
        id: '0',
        state: 'canceled'
      };
      const expectedFinding = Finding.fromObject({
        name: `${config.protocolName} Governance Proposal Canceled`,
        description: `Governance proposal ${proposal.id} has been canceled`,
        alertId: `${config.developerAbbreviation}-${config.protocolAbbreviation}-PROPOSAL-CANCELED`,
        type: 'Info',
        severity: 'Info',
        protocol: config.protocolName,
        metadata: {
          address: validContractAddress,
          ...proposal,
        },
      });

      expect(findings).toStrictEqual([expectedFinding]);
    });

    it('returns findings if contract address matches and ProposalQueued was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi['ProposalQueued'];

      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      let defaultLog = {};
      defaultLog.name = mockContractName;
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.args = mockArgs;
      defaultLog.data = data;
      defaultLog.signature = iface
        .getEvent(validEvent.name)
        .format(ethers.utils.FormatTypes.minimal)
        .substring(6);
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const proposal = {
        id: '0',
        state: 'queued'
      };
      const expectedFinding = Finding.fromObject({
        name: `${config.protocolName} Governance Proposal Queued`,
        description: `Governance proposal ${proposal.id} has been queued`,
        alertId: `${config.developerAbbreviation}-${config.protocolAbbreviation}-PROPOSAL-QUEUED`,
        type: 'Info',
        severity: 'Info',
        protocol: config.protocolName,
        metadata: {
          address: validContractAddress,
          ...proposal,
        },
      });

      expect(findings).toStrictEqual([expectedFinding]);
    });

    it('returns findings if contract address matches and ProposalExecuted was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi['ProposalExecuted'];

      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      let defaultLog = {};
      defaultLog.name = mockContractName;
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.args = mockArgs;
      defaultLog.data = data;
      defaultLog.signature = iface
        .getEvent(validEvent.name)
        .format(ethers.utils.FormatTypes.minimal)
        .substring(6);
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const proposal = {
        id: '0',
        state: 'executed'
      };
      const expectedFinding = Finding.fromObject({
        name: `${config.protocolName} Governance Proposal Executed`,
        description: `Governance proposal ${proposal.id} has been executed`,
        alertId: `${config.developerAbbreviation}-${config.protocolAbbreviation}-PROPOSAL-EXECUTED`,
        type: 'Info',
        severity: 'Info',
        protocol: config.protocolName,
        metadata: {
          address: validContractAddress,
          ...proposal,
        },
      });

      expect(findings).toStrictEqual([expectedFinding]);
    });

    it('returns findings if contract address matches and VoteEmitted was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi['VoteEmitted'];

      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      let defaultLog = {};
      defaultLog.name = mockContractName;
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.args = mockArgs;
      defaultLog.data = data;
      defaultLog.signature = iface
        .getEvent(validEvent.name)
        .format(ethers.utils.FormatTypes.minimal)
        .substring(6);
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const proposal = {
        id: '0',
        voter: '0x0000000000000000000000000000000000000000',
        weight: '0',
      };
      const expectedFinding = Finding.fromObject({
        name: `${config.protocolName} Governance Proposal Vote Emitted`,
        description: `Vote emitted with weight ${defaultLog.args.votingPower} in support of proposal ${defaultLog.args.id}`,
        alertId: `${config.developerAbbreviation}-${config.protocolAbbreviation}-VOTE-EMITTED`,
        type: 'Info',
        severity: 'Info',
        protocol: config.protocolName,
        metadata: {
          address: validContractAddress,
          ...proposal,
        },
      });

      expect(findings).toStrictEqual([expectedFinding]);
    });
  });
});
