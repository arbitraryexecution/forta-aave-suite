# Aave Stale Price Oracle

## Description

This agent monitors price oracle data to see if it has not been updated in over 24 hours.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-PRICE-ORACLE-STALE
  - Fired when data from an AAVE price oracle (Chainlink aggregator) is older than 24 hours
  - Severity is always set to "medium"
  - Type is always set to "degraded"
  - Metadata field contains additional alert information (token symbol, token address, oracle data
    age, oracle contract address)

## Test Data

To run all the tests for this agent, use the following command: `npm run test`
