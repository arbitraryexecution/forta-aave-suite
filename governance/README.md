# Aave Governance Events

## Description

This bot monitors transactions for Aave governance events.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-PROPOSAL-CREATED
  - Fired when a new Aave governance proposal is created
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of contract
    - Proposal information

<!-- -->
- AE-AAVE-PROPOSAL-EXECUTED
  - Fired when an Aave governance proposal is executed
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of contract
    - Proposal ID
    - State of proposal
    - First line of proposal description

<!-- -->
- AE-AAVE-PROPOSAL-QUEUED
  - Fired when an Aave governance proposal is queued
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of contract
    - Proposal ID
    - State of proposal
    - First line of proposal description

<!-- -->
- AE-AAVE-PROPOSAL-CANCELED
  - Fired when an Aave governance proposal is canceled
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of contract
    - Proposal ID
    - State of proposal
    - First line of proposal description

<!-- -->
- AE-AAVE-VOTE-EMITTED
  - Fired when a vote is cast on an Aave governance proposal
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of contract
    - Voter address
    - Weight of vote
    - Reason string that accompanies vote
    - First line of proposal description

<!-- -->
- AE-AAVE-EXECUTOR-AUTHORIZED
  - Fired when an executor is authorized by Aave governance
  - Type is always set to `Info`
  - Severity is always set to `High`
  - Metadata field contains:
    - Address of contract
    - Executor address
    - Reason string that accompanies authorization
    - First line of proposal description

<!-- -->
- AE-AAVE-EXECUTOR-UNAUTHORIZED
  - Fired when an executor is unauthorized by Aave governance
  - Type is always set to `Suspicious`
  - Severity is always set to `High`
  - Metadata field contains:
    - Address of contract
    - Executor address
    - Reason string that accompanies unauthorization
    - First line of proposal description

<!-- -->
- AE-AAVE-STRATEGY-CHANGED
  - Fired when the governance strategy has changed
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of contract
    - Address of the initiator of change
    - New strategy value
    - Reason string that accompanies strategy change
    - First line of proposal description

<!-- -->
- AE-AAVE-OWNERSHIP-TRANSFERRED
  - Fired when the ownership of the Aave governance contract has changed
  - Type is always set to `Suspicious`
  - Severity is always set to `High`
  - Metadata field contains:
    - Address of contract
    - Address of the previous owner
    - Address of the new owner
    - Reason string that accompanies ownership change
    - First line of proposal description

<!-- -->
- AE-AAVE-VOTING-DELAY-CHANGED
  - Fired when the voting delay has been changed
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of contract
    - Address of the initiator of change
    - New voting delay value
    - Reason string that accompanies delay change change
    - First line of proposal description

## Test Data

To run all the tests for this bot, use the following command: `npm run test`

To test against on-chain transactions, use: `npm run tx {transactionHash}`

Here are some transaction hashes that correspond to events that will cause findings to be created:

ExecutorAuthorized - 0x86af2695c4095ad78eab6bc2e0dcf6a648673bec8966cbe1ca8d3cadeca0b264

GovernanceStrategyChanged - 0xf14280953e9034fdf0c3cf62a917a982f42c67fc7bf0de241f41905b12778e39

OwnershipTransferred - 0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0

ProposalCanceled - 0x251efe9ece65d9cedd5ae7b5bd649dd8df0a5eec08bd2e8a1230aea76d976b42

ProposalCreated - 0x3706ac0fd5feb96f3315482fd07b7330fc654023f605358ef49ebfd40c25a722

ProposalExecuted - 0xbc40546b65ada9f5d4f8346f405a5f9c0da6d8f66bb27b7c64c0efa70eeae080

ProposalQueued - 0x0cc45d4cb0334c4a0a438cf872dce9e7e4f36d3183565feab924e54a332413b2

VoteEmitted - 0x8295f70196826dc5e1390f97330e537b5ff0183bd5c22c9a81f000cda15e8e45

VotingDelayChanged - 0x645324a65e3132aca7f277aea6d72a945593446c8755e99390c82848111698a0
