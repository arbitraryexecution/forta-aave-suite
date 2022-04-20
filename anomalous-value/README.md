# Aave Anomalous Value

## Description

This bot monitors Aave lending pool transactions that cross a predefined threshold amount.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-HIGH-TX-AMOUNT
  - Fired when an Aave Borrow/Deposit/Repay/Withdraw event crosses a predefined threshold amount
  - Severity is always set to "medium"
  - Type is always set to "suspicious" 
  - Metadata field contains the event log data

## Test Data

To run all the tests for this bot, use the following command: `npm run test`
