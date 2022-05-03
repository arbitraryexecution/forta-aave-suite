# Aave Loan Events Monitor

## Description

This bot monitors for the following loan-related events: Deposit, Withdraw, Borrow, Repay, and LiquidationCall.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-LOAN-EVENT
  - Emitted for any Deposit, Withdraw, Borrow, Repay, and LiquidationCall event
  - Type is set to event specific value in `bot-config.json`
  - Severity is set to event specific value in `bot-config.json`

## Test Data

To run all the tests for this bot, use the following command: `npm run test`

Additionally, the following transaction hashes will trigger their respective alert:

```
Deposit - 0x436bb69aba19b93ff56496798071537964e602eb6b4718679216e91337b6d185
Withdraw - 0xa06c1de924eed4426404337038f18b8f7b21df97497e42c9a09382fea8978e27
Borrow - 0x61aa11ebcda6257d0e11a4e6f00695aac77b96cec94fb20e9be261affa5d0c06
Repay - 0x920452ce87ccf0b374eb9ece68accd17eab1f4da7f8a4efae67652fa42501a5c
LiquidationCall - 0x34847d57e32bd8d2cc4abe5bc51eca753eb66bd6f5bff50a8816036c11a2a1a5
```

The above hashes can be run against the bot using the following syntax:

```
npx forta-agent run --tx <TX_HASH>
```
