# Aave Address Watch

## Description

This agent monitors addresses defined in a config file to see if they are involved in any transactions.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-ADDRESS-WATCH
  - Fired when any address from a pre-defined watchlist is involved in a transaction
  - Severity is always set to "low"
  - Type is always set to "suspicious" 
  - Metadata field contains "from" address and transaction hash

## Test Data

To run all the tests for this agent, use the following command: `npm run test`
