const { Finding, FindingSeverity, FindingType, } = require('forta-agent');
const { aaveEverestId } = require('../../agent-config.json');

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
    name: `Anomolous AAVE ${data.field}`,
    description: `Reserve: ${data.reserve}`,
    alertId: `AAVE-ANOMOLOUS-${data.field.toUpperCase()}`,
    severity: FindingSeverity.High,
    type: FindingType.Suspicious,
    everestId: aaveEverestId,
    metadata: JSON.stringify(data),
  });
}

module.exports = {
  createAlert,
  dataFields,
};
