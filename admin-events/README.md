# Aave Admin Events

## Description

This bot monitors transactions for Aave administrative events.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-ADMIN-EVENT
  - Fired when a transaction log contains an event that matches a list of Aave administrative events
  - Severity is always set to "low"
  - Type is always set to "suspicious" 
  - Metadata field contains Aave contract name and address, event name, and transaction hash

## Test Data

To run all the tests for this bot, use the following command: `npm run test`
