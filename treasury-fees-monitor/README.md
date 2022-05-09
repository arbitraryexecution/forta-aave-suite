# Aave Treasury Fees Monitor

## Description

This bot monitors for FlashLoan events and alerts when the amount of fees collected is greater than the configured threshold.

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-TREASURY-FEES
  - Emitted when a FlashLoan event has a 'premium' value greater than the configured threshold.
  - Type is set to Suspicious
  - Severity is set to High

## Test Data

To run all the tests for this bot, use the following command: `npm run test`

Additionally, the following transaction hash will trigger 3 separate alerts:

```
0xcd314668aaa9bbfebaf1a0bd2b6553d01dd58899c508d4729fa7311dc5d33ad7
```

The above hash can be run against the bot using the following syntax:

```
npx forta-agent run --tx <TX_HASH>
```
