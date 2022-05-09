# Aave Fallback Oracle Disparity

## Description

This bot monitors the price difference between the price oracle and fallback price oracle.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-FALLBACK-ORACLE-DISPARITY
  - Fired when the percent error between the asset price from the price oracle (Chainlink
    aggregator) and the asset price from the fallback oracle is greater than 2%
  - The fallback oracles are not well maintained, leading to the possibility of triggering alerts
    for every blockEvent.  Therefore, alerts are only emitted every 24 hours, containing a count of
    how many times an alert would have been triggered.
  - Severity is always set to 'high'
  - Type is always set to 'degraded'
  - Metadata field contains additional alert information (token symbol, token address, oracle asset
    price, fallback oracle asset price, percent error, and number of alerts accumulated in the last
    24 hours)

## Test Data

To run all the tests for this bot, use the following command: `npm run test`
