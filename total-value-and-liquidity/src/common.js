const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const { aaveEverestId: AAVE_EVEREST_ID } = require('../agent-config.json');

// data fields the agent is interested in
const dataFields = [
  'availableLiquidity',
  'totalStableDebt',
  'totalVariableDebt',
  'totalDebt',
  'totalValueLocked',
];

// helper function to create alerts
function createAlert(data) {
  return Finding.fromObject({
    name: `Anomalous AAVE ${data.field}`,
    description: `Reserve: ${data.reserve}`,
    alertId: 'AE-AAVE-TVL',
    severity: FindingSeverity.High,
    type: FindingType.Suspicious,
    everestId: AAVE_EVEREST_ID,
    metadata: JSON.stringify(data),
  });
}

module.exports = {
  createAlert,
  dataFields,
};