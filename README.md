# AAVE Reserve Watch

## Description

This agent detects large price changes in AAVE reserve assets

## Supported Chains

- Ethereum

## Alerts

- AE-AAVE-RESERVE-PRICE
  - Fired when an AAVE reserve price changes more than `numStds` standard deviations
  - Severity is always set to "medium"
  - Type is always set to "suspicious"
