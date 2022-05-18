const {
  Finding, FindingSeverity, FindingType, ethers, getEthersProvider,
} = require('forta-agent');
const BigNumber = require('bignumber.js');

const { getAbi } = require('./utils');

// load any bot configuration parameters
const config = require('../bot-config.json');

// set up a variable to hold initialization data used in the handler
const initializeData = {};
const DECIMALS_ABI = ['function decimals() view returns (uint)'];

function createAlert(protocolName, protocolAbbrev, developerAbbrev, type, severity, metadata) {
  const { assetTokenSymbol, assetTokenAddress, maxUtilizationRate } = metadata;
  return Finding.fromObject({
    name: `${protocolName} Borrow Collateral Ratio`,
    description: 'The ratio of total borrow amount to total liquidity exceeds the configured '
      + `threshold of ${maxUtilizationRate}% for asset ${assetTokenAddress} (${assetTokenSymbol})`,
    alertId: `${developerAbbrev}-${protocolAbbrev}-BORROW-COLLATERAL-RATIO`,
    type: FindingType[type],
    severity: FindingSeverity[severity],
    protocol: protocolName,
    metadata: {
      ...metadata,
    },
  });
}

function provideInitialize(data) {
  return async function initialize() {
    /* eslint-disable no-param-reassign */
    // assign configurable fields
    data.protocolName = config.protocolName;
    data.protocolAbbreviation = config.protocolAbbreviation;
    data.developerAbbreviation = config.developerAbbreviation;

    const { maxUtilizationRate, type, severity } = config.ratioSettings;
    data.maxUtilizationRate = maxUtilizationRate;
    data.type = type;
    data.severity = severity;

    const provider = getEthersProvider();
    const { ProtocolDataProvider: protocolDataProvider } = config.contracts;

    const { address: protocolDataProviderAddress } = protocolDataProvider;
    const protocolDataProviderAbi = getAbi(protocolDataProvider.abiFile);
    data.protocolDataProviderContract = new ethers.Contract(
      protocolDataProviderAddress,
      protocolDataProviderAbi,
      provider,
    );

    // get all aToken addresses from the protocol data provider contract
    data.assetTokens = await data.protocolDataProviderContract.getAllReservesTokens();
    data.tokenDecimals = {};
    // for each token address returned get its respective decimals
    await Promise.all(data.assetTokens.map(async (token) => {
      // token is an array where the first element is the token symbol and the second element is
      // the address
      const { tokenAddress } = token;
      const tokenContract = new ethers.Contract(tokenAddress, DECIMALS_ABI, provider);
      const decimals = await tokenContract.decimals();
      data.tokenDecimals[tokenAddress] = decimals.toString();
    }));
    /* eslint-enable no-param-reassign */
  };
}

function provideHandleBlock(data) {
  return async function handleBlock() {
    const {
      protocolName,
      protocolAbbreviation,
      developerAbbreviation,
      maxUtilizationRate,
      type,
      severity,
      assetTokens,
      tokenDecimals,
      protocolDataProviderContract,
    } = data;

    // iterate through each of the asset tokens in assetTokens and check the borrow to
    // collateral ratio
    const promises = assetTokens.map(async (assetToken) => {
      const finding = [];
      const { symbol, tokenAddress } = assetToken;
      const denominator = (new BigNumber(10)).pow(tokenDecimals[tokenAddress]);

      // get the data necessary to calculate a ratio between total borrows and collateral
      const assetTokenData = await protocolDataProviderContract.getReserveData(tokenAddress);
      let { availableLiquidity, totalStableDebt, totalVariableDebt } = assetTokenData;

      // scale the liquidity and debt totals
      availableLiquidity = (new BigNumber(availableLiquidity.toString())).div(denominator);
      totalStableDebt = (new BigNumber(totalStableDebt.toString())).div(denominator);
      totalVariableDebt = (new BigNumber(totalVariableDebt.toString())).div(denominator);

      // add the stable and variable debt amounts
      const totalDebt = totalStableDebt.plus(totalVariableDebt);
      // add the totalDebt to availableLiquidity to get totalLiquidity
      const totalLiquidity = availableLiquidity.plus(totalDebt);

      if (totalLiquidity.gt(0)) {
        const utilizationRate = totalDebt.div(totalLiquidity).times(100);
        if (utilizationRate.gt(new BigNumber(maxUtilizationRate.toString()))) {
          // utilizationRate is greater than the maxUtilizationRate specified in the config, so
          // generate a finding
          const metadata = {
            assetTokenSymbol: symbol,
            assetTokenAddress: tokenAddress,
            availableLiquidity: availableLiquidity.toString(),
            totalLiquidity: totalLiquidity.toString(),
            totalStableDebt: totalStableDebt.toString(),
            totalVariableDebt: totalVariableDebt.toString(),
            currUtilizationRate: utilizationRate.toFixed(2),
            maxUtilizationRate: maxUtilizationRate.toString(),
          };

          finding.push(createAlert(
            protocolName,
            protocolAbbreviation,
            developerAbbreviation,
            type,
            severity,
            metadata,
          ));
        }
      }

      return finding;
    });

    const findings = (await Promise.all(promises)).flat();
    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeData),
};
