# Aave Value Change

## Description

This agent monitors liquidity, debt, and TVL for large changes.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-TVL
  - Fired when available liquidity, total stable debt, total variable debt, total debt or total
    value locked drastically changes
  - Severity is always set to "high"
  - Type is always set to "suspicious"
  - Metadata field contains additional alert information (field, reserve, observation, average) 

## Test Data

To run all the tests for this agent, use the following command: `npm run test`
