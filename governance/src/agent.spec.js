const {
  Finding, TransactionEvent, ethers,
} = require('forta-agent');

const { provideHandleTransaction, provideInitialize } = require('./agent');
const { getAbi } = require('./utils');
const { createMockEventLogs, getObjectsFromAbi } = require('./test-utils');

const config = require('../bot-config.json');

/**
 * TransactionEvent(type, network, transaction, traces, addresses, block, logs, contractAddress)
 */
function createTxEvent({ logs, addresses }) {
  return new TransactionEvent(null, null, null, [], {}, null, logs, addresses);
}

// check the configuration file to verify the values
describe('check bot configuration file', () => {
  it('protocolName key required', () => {
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
    expect(Object.keys(contracts).length).toBe(1);
  });

  it('contracts key values must be valid', () => {
    const firstContractName = Object.keys(config.contracts)[0];
    const { address } = config.contracts[firstContractName];

    // check that the address is a valid address
    expect(ethers.utils.isHexString(address, 20)).toBe(true);
  });
});

const [[, firstContract]] = Object.entries(config.contracts);
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

// tests
describe('monitor governance contracts for emitted events', () => {
  describe('handleTransaction', () => {
    let initializeData;
    let handleTransaction;
    let mockTxEvent;

    // constants
    const mockContractAddress = ethers.utils.hexZeroPad('0x1', 20);
    const iface = new ethers.utils.Interface(abi);
    let validContractAddress = '';

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
      mockTxEvent = createTxEvent({ logs: [], addresses: {} });
    });

    it('returns empty findings if contract address does not match', async () => {
      // build txEvent
      mockTxEvent.logs = logsNoMatchAddress;

      // run bot
      const findings = await handleTransaction(mockTxEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if contract address matches but not event', async () => {
      // build tx event
      mockTxEvent.logs = logsNoMatchEvent;

      // run bot
      const findings = await handleTransaction(mockTxEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns findings if contract address matches and ProposalCreated was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi.ProposalCreated;

      // encode event data - valid event with valid arguments
      const { mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      const defaultLog = {};
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.data = data;
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

    it('returns findings if contract address matches and ProposalQueued was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi.ProposalQueued;

      // encode event data - valid event with valid arguments
      const { mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      const defaultLog = {};
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.data = data;
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const proposal = {
        id: '0',
        state: 'queued',
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
      const validEvent = eventsInAbi.ProposalExecuted;

      // encode event data - valid event with valid arguments
      const { mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      const defaultLog = {};
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.data = data;
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const proposal = {
        id: '0',
        state: 'executed',
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

    it('returns findings if contract address matches and ProposalCanceled was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi.ProposalCanceled;

      // encode event data - valid event with valid arguments
      const { mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      const defaultLog = {};
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.data = data;
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const proposal = {
        id: '0',
        state: 'canceled',
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

    it('returns findings if contract address matches and VoteEmitted was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi.VoteEmitted;

      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      const defaultLog = {};
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.data = data;
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const proposal = {
        id: '0',
        voter: '0x0000000000000000000000000000000000000000',
        weight: '0',
      };
      const expectedFinding = Finding.fromObject({
        name: `${config.protocolName} Governance Proposal Vote Emitted`,
        description: `Vote emitted with weight ${mockArgs.votingPower} in support of proposal ${mockArgs.id}`,
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

    it('returns findings if contract address matches and Executor Authorized was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi.ExecutorAuthorized;

      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      const defaultLog = {};
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.data = data;
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const executorInfo = {
        executor: '0x0000000000000000000000000000000000000000',
        state: 'executor-authorized',
      };
      const expectedFinding = Finding.fromObject({
        name: `${config.protocolName} Governance Executor Authorized`,
        description: `Authorized executor ${mockArgs.executor}`,
        alertId: `${config.developerAbbreviation}-${config.protocolAbbreviation}-EXECUTOR-AUTHORIZED`,
        type: 'Info',
        severity: 'High',
        protocol: config.protocolName,
        metadata: {
          address: validContractAddress,
          ...executorInfo,
        },
      });

      expect(findings).toStrictEqual([expectedFinding]);
    });

    it('returns findings if contract address matches and Executor Unauthorized was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi.ExecutorUnauthorized;

      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      const defaultLog = {};
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.data = data;
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const executorInfo = {
        executor: '0x0000000000000000000000000000000000000000',
        state: 'executor-unauthorized',
      };
      const expectedFinding = Finding.fromObject({
        name: `${config.protocolName} Governance Executor Unauthorized`,
        description: `Deauthorized executor ${mockArgs.executor}`,
        alertId: `${config.developerAbbreviation}-${config.protocolAbbreviation}-EXECUTOR-UNAUTHORIZED`,
        type: 'Suspicious',
        severity: 'High',
        protocol: config.protocolName,
        metadata: {
          address: validContractAddress,
          ...executorInfo,
        },
      });

      expect(findings).toStrictEqual([expectedFinding]);
    });

    it('returns findings if contract address matches and Governance Strategy Changed was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi.GovernanceStrategyChanged;

      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      const defaultLog = {};
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.data = data;
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const strategyInfo = {
        initiatorChange: '0x0000000000000000000000000000000000000000',
        newStrategy: '0x0000000000000000000000000000000000000000',
        state: 'strategy-changed',
      };
      const expectedFinding = Finding.fromObject({
        name: `${config.protocolName} Governance Strategy Changed`,
        description: `Governance strategy changed to ${mockArgs.newStrategy} by ${mockArgs.initiatorChange}`,
        alertId: `${config.developerAbbreviation}-${config.protocolAbbreviation}-STRATEGY-CHANGED`,
        type: 'Info',
        severity: 'Info',
        protocol: config.protocolName,
        metadata: {
          address: validContractAddress,
          ...strategyInfo,
        },
      });

      expect(findings).toStrictEqual([expectedFinding]);
    });

    it('returns findings if contract address matches and Ownership Transferred was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi.OwnershipTransferred;

      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      const defaultLog = {};
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.data = data;
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const ownerInfo = {
        previousOwner: '0x0000000000000000000000000000000000000000',
        newOwner: '0x0000000000000000000000000000000000000000',
        state: 'ownership-transferred',
      };
      const expectedFinding = Finding.fromObject({
        name: `${config.protocolName} Governance Ownership Transferred`,
        description: `Governance ownership transferred from ${mockArgs.previousOwner} to ${mockArgs.newOwner}`,
        alertId: `${config.developerAbbreviation}-${config.protocolAbbreviation}-OWNERSHIP-TRANSFERRED`,
        type: 'Suspicious',
        severity: 'High',
        protocol: config.protocolName,
        metadata: {
          address: validContractAddress,
          ...ownerInfo,
        },
      });

      expect(findings).toStrictEqual([expectedFinding]);
    });

    it('returns findings if contract address matches and Voting Delay Changed was emitted', async () => {
      const eventsInAbi = getObjectsFromAbi(abi, 'event');
      const validEvent = eventsInAbi.VotingDelayChanged;

      // encode event data - valid event with valid arguments
      const { mockArgs, mockTopics, data } = createMockEventLogs(
        validEvent,
        iface,
      );

      // update mock transaction event
      const defaultLog = {};
      defaultLog.address = validContractAddress;
      defaultLog.topics = mockTopics;
      defaultLog.data = data;
      mockTxEvent.logs.push(defaultLog);

      const findings = await handleTransaction(mockTxEvent);

      const voteInfo = {
        newVotingDelay: '0',
        initiatorChange: '0x0000000000000000000000000000000000000000',
        state: 'voting-delay-changed',
      };
      const expectedFinding = Finding.fromObject({
        name: `${config.protocolName} Governance Voting Delay Changed`,
        description: `Voting delay changed to ${mockArgs.newVotingDelay} by ${mockArgs.initiatorChange}`,
        alertId: `${config.developerAbbreviation}-${config.protocolAbbreviation}-VOTING-DELAY-CHANGED`,
        type: 'Info',
        severity: 'Info',
        protocol: config.protocolName,
        metadata: {
          address: validContractAddress,
          ...voteInfo,
        },
      });

      expect(findings).toStrictEqual([expectedFinding]);
    });
  });
});
