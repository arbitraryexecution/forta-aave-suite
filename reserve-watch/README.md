# Aave Reserve Price

## Description

This agent monitors large Aave reserve price changes.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-RESERVE-PRICE
  - Fired when an AAVE reserve price changes more than `numStds` standard deviations
  - Severity is always set to "medium"
  - Type is always set to "suspicious"
  - Metadata field contains symbol and price

## Test Data

To run all the tests for this agent, use the following command: `npm run test`