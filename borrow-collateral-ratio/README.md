# Aave Borrow Collateral Ratio

## Description

This bot monitors the total borrow to total collateral ratio (aka utilization rate) to see if it
exceeds the percent threshold specified in the config.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-BORROW-COLLATERAL-RATIO
  - Emitted when the total borrow to total collateral ratio exceeds the percent
    threshold specified in `bot-config.json`
  - Type is set to event specific value in `bot-config.json`
  - Severity is set to event specific value in `bot-config.json`
  - The `metadata` field contains the following values:
    - `assetTokenSymbol`
    - `assetTokenAddress`
    - `availableLiquidity`
    - `totalLiquidity`
    - `totalStableDebt`
    - `totalVariableDebt`
    - `currUtilizationRate`
    - `maxUtilizationRate`

## Test Data

To run all the tests for this bot, use the following command: `npm run test`
