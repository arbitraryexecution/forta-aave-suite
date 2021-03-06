const {
  Finding, ethers,
} = require('forta-agent');

const { getAbi, getEventSignatures } = require('./utils');

// load config data
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};

function createProposalFromLog(log) {
  const proposal = {
    id: log.args.id.toString(),
    creator: log.args.creator,
    targets: log.args.targets.join(','),
    signatures: log.args.signatures.join(','),
    calldatas: log.args.calldatas.join(','),
    startBlock: log.args.startBlock.toString(),
    endBlock: log.args.endBlock.toString(),
  };
  return proposal;
}

// alert for when a new governance proposal is created
function proposalCreatedFinding(proposal, address, botState) {
  return Finding.fromObject({
    name: `${botState.protocolName} Governance Proposal Created`,
    description: `Governance Proposal ${proposal.id} was just created`,
    alertId: `${botState.developerAbbreviation}-${botState.protocolAbbreviation}-PROPOSAL-CREATED`,
    type: 'Info',
    severity: 'Info',
    protocol: botState.protocolName,
    metadata: {
      address,
      ...proposal,
    },
  });
}

function voteEmittedFinding(voteInfo, address, botState) {
  let description = `Vote emitted with weight ${voteInfo.votingPower.toString()}`;
  if (voteInfo.support) {
    description += ' in support of';
  } else {
    description += ' against';
  }
  description += ` proposal ${voteInfo.id}`;

  return Finding.fromObject({
    name: `${botState.protocolName} Governance Proposal Vote Emitted`,
    description,
    alertId: `${botState.developerAbbreviation}-${botState.protocolAbbreviation}-VOTE-EMITTED`,
    type: 'Info',
    severity: 'Info',
    protocol: botState.protocolName,
    metadata: {
      id: voteInfo.id.toString(),
      address,
      voter: voteInfo.voter,
      weight: voteInfo.votingPower.toString(),
    },
  });
}

function proposalCanceledFinding(proposalId, address, botState) {
  return Finding.fromObject({
    name: `${botState.protocolName} Governance Proposal Canceled`,
    description: `Governance proposal ${proposalId} has been canceled`,
    alertId: `${botState.developerAbbreviation}-${botState.protocolAbbreviation}-PROPOSAL-CANCELED`,
    type: 'Info',
    severity: 'Info',
    protocol: botState.protocolName,
    metadata: {
      address,
      id: proposalId,
      state: 'canceled',
    },
  });
}

function proposalExecutedFinding(proposalId, address, botState) {
  return Finding.fromObject({
    name: `${botState.protocolName} Governance Proposal Executed`,
    description: `Governance proposal ${proposalId} has been executed`,
    alertId: `${botState.developerAbbreviation}-${botState.protocolAbbreviation}-PROPOSAL-EXECUTED`,
    type: 'Info',
    severity: 'Info',
    protocol: botState.protocolName,
    metadata: {
      address,
      id: proposalId,
      state: 'executed',
    },
  });
}

function proposalQueuedFinding(proposalId, address, botState) {
  return Finding.fromObject({
    name: `${botState.protocolName} Governance Proposal Queued`,
    description: `Governance proposal ${proposalId} has been queued`,
    alertId: `${botState.developerAbbreviation}-${botState.protocolAbbreviation}-PROPOSAL-QUEUED`,
    type: 'Info',
    severity: 'Info',
    protocol: botState.protocolName,
    metadata: {
      address,
      id: proposalId,
      state: 'queued',
    },
  });
}

function executorAuthorized(executorInfo, address, botState) {
  return Finding.fromObject({
    name: `${botState.protocolName} Governance Executor Authorized`,
    description: `Authorized executor ${executorInfo.executor}`,
    alertId: `${botState.developerAbbreviation}-${botState.protocolAbbreviation}-EXECUTOR-AUTHORIZED`,
    type: 'Info',
    severity: 'High',
    protocol: botState.protocolName,
    metadata: {
      address,
      executor: executorInfo.executor,
      state: 'executor-authorized',
    },
  });
}

function executorUnauthorized(executorInfo, address, botState) {
  return Finding.fromObject({
    name: `${botState.protocolName} Governance Executor Unauthorized`,
    description: `Deauthorized executor ${executorInfo.executor}`,
    alertId: `${botState.developerAbbreviation}-${botState.protocolAbbreviation}-EXECUTOR-UNAUTHORIZED`,
    type: 'Suspicious',
    severity: 'High',
    protocol: botState.protocolName,
    metadata: {
      address,
      executor: executorInfo.executor,
      state: 'executor-unauthorized',
    },
  });
}

function governanceStrategyChanged(strategyInfo, address, botState) {
  return Finding.fromObject({
    name: `${botState.protocolName} Governance Strategy Changed`,
    description: `Governance strategy changed to ${strategyInfo.newStrategy} by ${strategyInfo.initiatorChange}`,
    alertId: `${botState.developerAbbreviation}-${botState.protocolAbbreviation}-STRATEGY-CHANGED`,
    type: 'Info',
    severity: 'Info',
    protocol: botState.protocolName,
    metadata: {
      address,
      initiatorChange: strategyInfo.initiatorChange,
      newStrategy: strategyInfo.newStrategy,
      state: 'strategy-changed',
    },
  });
}

function ownershipTransferred(ownerInfo, address, botState) {
  return Finding.fromObject({
    name: `${botState.protocolName} Governance Ownership Transferred`,
    description: `Governance ownership transferred from ${ownerInfo.previousOwner} to ${ownerInfo.newOwner}`,
    alertId: `${botState.developerAbbreviation}-${botState.protocolAbbreviation}-OWNERSHIP-TRANSFERRED`,
    type: 'Suspicious',
    severity: 'High',
    protocol: botState.protocolName,
    metadata: {
      address,
      previousOwner: ownerInfo.previousOwner,
      newOwner: ownerInfo.newOwner,
      state: 'ownership-transferred',
    },
  });
}

function votingDelayChanged(voteInfo, address, botState) {
  return Finding.fromObject({
    name: `${botState.protocolName} Governance Voting Delay Changed`,
    description: `Voting delay changed to ${voteInfo.newVotingDelay.toString()} by ${voteInfo.initiatorChange}`,
    alertId: `${botState.developerAbbreviation}-${botState.protocolAbbreviation}-VOTING-DELAY-CHANGED`,
    type: 'Info',
    severity: 'Info',
    protocol: botState.protocolName,
    metadata: {
      address,
      state: 'voting-delay-changed',
      newVotingDelay: voteInfo.newVotingDelay.toString(),
      initiatorChange: voteInfo.initiatorChange,
    },
  });
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // assign configurable fields
    data.governance = config.contracts;
    data.protocolName = config.protocolName;
    data.protocolAbbreviation = config.protocolAbbreviation;
    data.developerAbbreviation = config.developerAbbreviation;

    // load the contract addresses, abis, and ethers interfaces
    data.contracts = Object.entries(data.governance).map(([name, entry]) => {
      if (entry.address === undefined) {
        throw new Error(`No address found in configuration file for '${name}'`);
      }

      if (entry.abiFile === undefined) {
        throw new Error(`No ABI file found in configuration file for '${name}'`);
      }

      const abi = getAbi(entry.abiFile);
      const iface = new ethers.utils.Interface(abi);

      const contract = {
        name,
        address: entry.address,
        iface,
      };

      contract.eventSignatures = getEventSignatures(contract, entry.events);

      return contract;
    });

    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const findings = [];

    data.contracts.forEach((contract) => {
      const { address, eventSignatures } = contract;
      const logs = txEvent.filterLog(eventSignatures, address);

      // iterate over all logs to determine what governance actions were taken
      let results = logs.map((log) => {
        switch (log.name) {
          case 'ProposalCreated': {
            const proposal = createProposalFromLog(log);
            return proposalCreatedFinding(
              proposal,
              address,
              data,
            );
          }
          case 'ProposalExecuted':
            return proposalExecutedFinding(log.args.id.toString(), address, data);
          case 'ProposalQueued':
            return proposalQueuedFinding(
              log.args.id.toString(),
              address,
              data,
            );
          case 'ProposalCanceled':
            return proposalCanceledFinding(log.args.id.toString(), address, data);
          case 'VoteEmitted':
            return voteEmittedFinding(log.args, address, data);
          case 'ExecutorAuthorized':
            return executorAuthorized(log.args, address, data);
          case 'ExecutorUnauthorized':
            return executorUnauthorized(log.args, address, data);
          case 'GovernanceStrategyChanged':
            return governanceStrategyChanged(log.args, address, data);
          case 'OwnershipTransferred':
            return ownershipTransferred(log.args, address, data);
          case 'VotingDelayChanged':
            return votingDelayChanged(log.args, address, data);
          default:
            return undefined;
        }
      });

      results = results.filter((result) => result !== undefined);
      findings.push(...(results.flat()));
    });

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
};
