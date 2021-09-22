# Forta Aave Suite

## Description

This agent monitors various aspects of the Aave protocol.  The Aave suite currently contains
the following handlers:

- address-watch
- admin-events
- anomalous-value
- reserve-watch
- total-value-and-liquidity
- check-reserve-update-frequency
- new-contract-interaction

## Supported Chains

- Ethereum

## Alerts

- AE-AAVE-RESERVE-PRICE
  - Fired when an AAVE reserve price changes more than `numStds` standard deviations
  - Severity is always set to "medium"
  - Type is always set to "suspicious"
  - Metadata field contains symbol and price

<!-- -->
- AE-AAVE-ADDRESS-WATCH
  - Fired when any address from a pre-defined watchlist is involved in a transaction
  - Severity is always set to "low"
  - Type is always set to "suspicious" 
  - Metadata field contains "from" address and transaction hash

<!-- -->
- AE-AAVE-ADMIN-EVENT
  - Fired when a transaction log contains an event that matches a list of Aave administrative events
  - Severity is always set to "low"
  - Type is always set to "suspicious" 
  - Metadata field contains Aave contract name and address, event name, and transaction hash

<!-- -->
- AE-AAVE-HIGH-TX-AMOUNT
  - Fired when an Aave Borrow/Deposit/Repay/Withdraw event crosses a predefined threshold amount
  - Severity is always set to "medium"
  - Type is always set to "suspicious" 
  - Metadata field contains the event log data

<!-- -->
- AE-AAVE-TVL
  - Fired when available liquidity, total stable debt, total variable debt, total debt or total
    value locked drastically changes
  - Severity is always set to "high"
  - Type is always set to "suspicious"
  - Metadata field contains additional alert information (field, reserve, observation, average)

<!-- -->
- AE-AAVE-PRICE-ORACLE-STALE
  - Fired when data from an AAVE price oracle (Chainlink aggregator) is older than 24 hours
  - Severity is always set to "medium"
  - Type is always set to "degraded"
  - Metadata field contains additional alert information (token symbol, token address, oracle data
    age, oracle contract address)

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
