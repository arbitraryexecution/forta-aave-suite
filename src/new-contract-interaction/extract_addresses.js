// extract all the token addresses from aave's mainnet.json file

const fs = require('fs');

const tokenAddressesData = fs.readFileSync('./mainnet.json');
const tokenAddresses = JSON.parse(tokenAddressesData).proto;

const addresses = [];

// each entry in the tokenAddresses array contains 4 token contract addresses:
// - aTokenAddress (e.g. aUSDT)
// - stableDebtTokenAddress (e.g. stableDebtUSDT)
// - variableDebtTokenAddress (e.g. variableDebtUSDT)
// - address (e.g. USDT)
tokenAddresses.forEach((item) => {
  addresses.push(item.aTokenAddress.toLowerCase());
  addresses.push(item.stableDebtTokenAddress.toLowerCase());
  addresses.push(item.variableDebtTokenAddress.toLowerCase());
  addresses.push(item.address.toLowerCase());
});

// write out the list to token-addresses.json
fs.writeFileSync('./token-addresses.json', JSON.stringify(addresses));

// eslint-disable-next-line no-console
console.log(`Extracted ${addresses.length} addresses.`);
