# Aave Governance Events

## Description

This bot monitors transactions for Aave governance events.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-PROPOSAL-CREATED
  - Fired when a new Aave governance proposal is created
  - Severity is set to 'info'
  - Type is set to 'Info'
  - Metadata contains the Aave contract address and the proposal

<!-- -->
- AE-AAVE-PROPOSAL-EXECUTED
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of contract
    - Proposal ID
    - State of proposal
    - First line of proposal description

<!-- -->
- AE-AAVE-PROPOSAL-QUEUED
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of contract
    - Proposal ID
    - State of proposal
    - First line of proposal description

<!-- -->
- AE-AAVE-PROPOSAL-CANCELED
  - Type is always set to `Info`
  - Severity is always set to `Info`
  - Metadata field contains:
    - Address of contract
    - Proposal ID
    - State of proposal
    - First line of proposal description

<!-- -->
- AE-AAVE-VOTE-EMITTED
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
  - Type is always set to `Info`
  - Severity is always set to `High`
  - Metadata field contains:
    - Address of contract
    - Executor address
    - Reason string that accompanies authorization
    - First line of proposal description

<!-- -->
- AE-AAVE-EXECUTOR-UNAUTHORIZED
  - Type is always set to `Suspicious`
  - Severity is always set to `High`
  - Metadata field contains:
    - Address of contract
    - Executor address
    - Reason string that accompanies unauthorization
    - First line of proposal description

<!-- -->
- AE-AAVE-STRATEGY-CHANGED
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

To test a VoteEmitted event, try: `npm run tx 0x8295f70196826dc5e1390f97330e537b5ff0183bd5c22c9a81f000cda15e8e45`
To test a ProposalExecuted event, try: `npm run tx 0xbc40546b65ada9f5d4f8346f405a5f9c0da6d8f66bb27b7c64c0efa70eeae080`
