# Aave Treasury Fees Monitor

## Description

This bot monitors for FlashLoan events and alerts when the premium (aka the fees) collected from the
FlashLoan exceeds either:
  1. the configured low threshold value
  2. a computed statistical high threshold of `(mean + (3 * standard deviation))`

## Supported Chains

- Ethereum Mainnet

## Alerts

<!-- -->
- AE-AAVE-TREASURY-FEES
  - Emitted when a FlashLoan event has a `premium` value greater than either the configured low threshold
    or the computed statistical high threshold
  - Type is configurable
  - Severity is configurable

## Test Data

To run all the tests for this bot, use the following command: `npm run test`

Additionally, the following transaction hash will trigger 3 high threshold alerts:

```
0xcd314668aaa9bbfebaf1a0bd2b6553d01dd58899c508d4729fa7311dc5d33ad7
```

The above hash can be run against the bot using the following syntax:

```
npx forta-agent run --tx <TX_HASH>
```
