# Aave New Contract Interaction

## Description

This bot monitors new contract interactions with the Aave Lending Pool contract.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-NEW-CONTRACT-INTERACTION
  - Fired when a relatively new contract (age defined in config JSON file) interacts with the Aave
    Lending Pool contract
  - Severity is always set to "medium"
  - Type is always set to "suspicious"
  - Metadata field contains the contract address and contract age in days

## Test Data

To run all the tests for this bot, use the following command: `npm run test`
