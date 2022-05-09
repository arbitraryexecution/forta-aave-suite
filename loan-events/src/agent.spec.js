const mockContract = {};

jest.mock('forta-agent', () => ({
  ...jest.requireActual('forta-agent'),
  getEthersProvider: jest.fn(),
  ethers: {
    ...jest.requireActual('ethers'),
    Contract: jest.fn().mockReturnValue(mockContract),
  },
}));

const {
  Finding, FindingType, FindingSeverity, ethers, TransactionEvent,
} = require('forta-agent');

const { provideHandleTransaction, provideInitialize } = require('./agent');
const {
  getObjectsFromAbi,
  getEventFromConfig,
  createMockEventLogs,
} = require('./test-utils');

const utils = require('./utils');

const config = require('../bot-config.json');

// utility function specific for this test module
// we are intentionally not using the Forta SDK function due to issues with
// jest mocking the module and interfering with default function values
function createTransactionEvent(txObject) {
  const txEvent = new TransactionEvent(
    null,
    null,
    null,
    [],
    {},
    null,
    txObject.logs,
    null,
  );
  return txEvent;
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
    expect(contracts).not.toBe({});
  });

  it('contracts key values must be valid', () => {
    const { contracts } = config;
    Object.keys(contracts).forEach((key) => {
      const { address, abiFile, events } = contracts[key];

      // only check that an address exists for the LendingPoolAddressesProvider entry
      if (key === 'LendingPoolAddressesProvider') {
        expect(address).not.toBe(undefined);

        // check that the address is a valid address
        expect(ethers.utils.isHexString(address, 20)).toBe(true);
      }

      // load the ABI from the specified file
      // the call to getAbi will fail if the file does not exist
      const abi = utils.getAbi(abiFile);

      if (events !== undefined) {
        const eventObjects = getObjectsFromAbi(abi, 'event');
        // for all of the events specified, verify that they exist in the ABI
        Object.keys(events).forEach((eventName) => {
          expect(Object.keys(eventObjects).indexOf(eventName)).not.toBe(-1);

          const entry = events[eventName];
          const { type, severity } = entry;

          // check type, this will fail if 'type' is not valid
          expect(Object.prototype.hasOwnProperty.call(FindingType, type)).toBe(true);

          // check severity, this will fail if 'severity' is not valid
          expect(Object.prototype.hasOwnProperty.call(FindingSeverity, severity)).toBe(true);
        });
      }
    });
  });
});

// tests
describe('monitor emitted events', () => {
  describe('handleTransaction', () => {
    let initializeData;
    let developerAbbreviation;
    let protocolAbbreviation;
    let protocolName;
    let handleTransaction;
    let mockTxEvent;
    let iface;
    let abi;
    let eventInConfig;
    let eventNotInConfig;
    let findingType;
    let findingSeverity;
    const mockContractAddress = ethers.utils.getAddress('0x230E76a625927709618AB27761d574A5CFf75d61');

    beforeEach(async () => {
      initializeData = {};

      mockContract.getLendingPool = jest.fn().mockResolvedValue(mockContractAddress);

      // initialize the handler
      await provideInitialize(initializeData)();
      handleTransaction = provideHandleTransaction(initializeData);

      ({ protocolName, protocolAbbreviation, developerAbbreviation } = config);

      // grab the 'LendingPool' entry from the 'contracts' key in the configuration file
      const {
        contracts: {
          LendingPool: lendingPool,
        },
      } = config;
      const { abiFile, events } = lendingPool;
      abi = utils.getAbi(abiFile);

      ({
        eventInConfig,
        eventNotInConfig,
        findingType,
        findingSeverity,
      } = getEventFromConfig(abi, events));

      if (eventInConfig === undefined) {
        throw new Error('Could not extract valid event from configuration file');
      }

      if (eventNotInConfig === undefined) {
        // if no other events were present in the ABI, generate a default event so the tests can
        // be run
        eventNotInConfig = {
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
        abi.push(eventNotInConfig);
      }

      iface = new ethers.utils.Interface(abi);

      // initialize mock transaction event with default values
      mockTxEvent = createTransactionEvent({
        logs: [],
      });
    });

    it('returns empty findings if no monitored events were emitted in the transaction', async () => {
      const findings = await handleTransaction(mockTxEvent);
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if contract address does not match', async () => {
      // encode event data
      // valid event name with valid name, signature, topic, and args
      const { mockTopics, data } = createMockEventLogs(eventInConfig, iface);

      const mockEvent = {
        address: ethers.constants.AddressZero,
        topics: mockTopics,
        data,
      };

      mockTxEvent.logs.push(mockEvent);

      const findings = await handleTransaction(mockTxEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if contract address matches but no monitored event was emitted', async () => {
      // encode event data - valid event with valid arguments
      const { mockTopics, data } = createMockEventLogs(eventNotInConfig, iface);

      const mockEvent = {
        address: mockContractAddress,
        topics: mockTopics,
        data,
      };

      mockTxEvent.logs.push(mockEvent);

      const findings = await handleTransaction(mockTxEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if contract address matches and a monitored event was emitted', async () => {
      // encode event data
      // valid event name with valid name, signature, topic, and args
      const { mockArgs, mockTopics, data } = createMockEventLogs(eventInConfig, iface);

      const mockEvent = {
        address: mockContractAddress,
        topics: mockTopics,
        data,
      };

      mockTxEvent.logs.push(mockEvent);

      const findings = await handleTransaction(mockTxEvent);
      const expectedFinding = Finding.fromObject({
        name: `${protocolName} Lending Pool Loan Event`,
        description: `The ${eventInConfig.name} event was emitted`,
        alertId: `${developerAbbreviation}-${protocolAbbreviation}-LOAN-EVENT`,
        type: FindingType[findingType],
        severity: FindingSeverity[findingSeverity],
        protocol: protocolName,
        metadata: {
          eventName: eventInConfig.name,
          ...utils.extractEventArgs(mockArgs),
        },
      });

      expect(findings).toStrictEqual([expectedFinding]);
    });
  });
});
