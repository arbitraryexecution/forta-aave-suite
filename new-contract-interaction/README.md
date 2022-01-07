# Aave New Contract Interaction

## Description

This agent monitors new contract interactions with the Aave Lending Pool contract.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-NEW-CONTRACT-INTERACTION
  - Fired when a relatively new contract (age defined in config JSON file) interacts with the Aave
    Lending Pool contract
  - Severity is always set to "medium"
  - Type is always set to "suspicious"
  - Metadata field contains the contract address and contract age in days

  NOTE: The new-contract-interaction handler has additional requirements.
  
  This handler uses the Etherscan API to determine contract age.  With an API key, requests are
  limited to 5 per second.  Without an API key, requests are limited to 1 every 5 seconds.
  For performance reasons, if no API key is provided, this handler will not execute.
  
  To run the agent with an API key:
  
  1) Create a .env file with the following contents:
  
  ```
  ETHERSCAN_API_KEY="<insert key here>"
  ```
  
  2) Execute the `docker run` command with the additional option `--env-file <path-to-env-file>`
  

## Test Data

To run all the tests for this agent, use the following command: `npm run test`
