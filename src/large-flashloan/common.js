const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const { aaveEverestId } = require('../../agent-config.json');

// helper function to create alerts
function createAlert(data) {
  return Finding.fromObject({
    name: `Large flashloan`,
    description: `Flashloan with ${} eth profit`,
    alertId: `AE-AAVE-LARGE-FLASHLOAN`,
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
