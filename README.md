# Forta Aave Suite

## Description

This agent monitors various aspects of the Aave protocol.  The Aave suite currently contains
the following handlers:

- address-watch
- admin-events
- anomalous-value

Additional handlers are currently under development.

## Supported Chains

- Ethereum

## Alerts

- AE-AAVE-ADDRESS-WATCH
  - Fired when any address from a pre-defined watchlist is involved in a transaction
  - Severity is always set to "low"
  - Type is always set to "suspicious" 
  - Metadata field contains "from" address and transaction hash
  
- AE-AAVE-ADMIN-EVENT
  - Fired when a transaction log contains an event that matches a list of Aave administrative events
  - Severity is always set to "low"
  - Type is always set to "suspicious" 
  - Metadata field contains Aave contract name and address, event name, and transaction hash

- AE-AAVE-HIGH-TX-AMOUNT
  - Fired when an Aave Borrow/Deposit/Repay/Withdraw event crosses a predefined threshold amount
  - Severity is always set to "medium"
  - Type is always set to "suspicious" 
  - Metadata field contains the event log data

## Test Data

To run all the tests for this agent, use the following command: `npm run test`

