const ethers = require('ethers');
const BigNumber = require('bignumber.js');
const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');

// mockable libraries
const RollingMath = require('rolling-math');
jest.mock('rolling-math');

// get config settings
const Config = require('../../agent-config.json')['total-value-and-liquidity'];

const baseRollingMath = {
  getWindowSize: jest.fn(function() {
    return this.arg0;
  }),
  getElements: jest.fn(() => 0),
  getSum: jest.fn(() => 0),
  getAverage: jest.fn(() => 0),
  getStandardDeviation: jest.fn(() => 0),
  addElement: jest.fn(() => 0),
};

// creates a mock class implementation with constructor
// returns references to mocked funcs
function mockLibrary(baseMockLibrary, overrides) {
  const mockImplementation = jest.fn(function () {
    // funcs will contain the mocked classes function definitions
    // first add the base unimplemented classes
    //
    // TODO: this is dangerous because it won't fail if someone doesn't mock their
    // function properly
    const funcs = {
      ...baseMockLibrary,
    };

    // update constructor aruments, they can be referenced inside of the function
    // implementations with the name `arg0`, `arg1`, ..., `argN`
    Object.entries(arguments).forEach((entry) => {
      funcs[ 'arg'.concat(entry[0]) ] = entry[1];
    });

    // override function definitions and constructor arguments
    Object.assign(funcs, overrides);

    return funcs;
  });

  // return the mock implementation and handles to all mock functions
  return {
    mockImplementation,
    mockFunctions: {
      ...baseMockLibrary,
      ...overrides,
    }
  }
}

describe('liquidity and total value locked agent tests', () => {
  let handleTransaction;

  describe('configurations work for', () => {
    it('window size', () => {
    });

    it('standard devation limit', () => {
    });

    it('minimum elements before triggering', () => {
    }
  });

  describe('doesn\'t alert when', () => {
    it('observation isn\'t outside standard deviation limit', () => {
    });

    it('there aren\'t enough previously recorded elements', () => {
    });

    it('it is the first element seen', () => {
    });
  });

  describe('whenever you pass a block it', () => {
    it('will add the observation into the dataset', () => {
    });

    it('will create a new data set if it hasn\'t seen the address before', () => {
    });

    it('will get reserves and grab the data from the reserves', () => {
    });
  });

  describe('alerts when', () => {
    it('recieves an event that is outside the std limit and has adequate previous data', () => {
    });
  });
});










const myOverrides = { getSum: jest.fn(() => 420) };

const res = mockLibrary(baseRollingMath, myOverrides);
RollingMath.mockImplementation(res.mockImplementation);
const testRollingMath = new RollingMath(69);
console.log(testRollingMath.getWindowSize());
console.log(testRollingMath.getSum());
console.log(res.mockFunctions.getSum.mock.calls.length);
console.log(testRollingMath.getSum());
console.log(res.mockFunctions.getSum.mock.calls.length);
res.mockFunctions.getSum.mockImplementation(jest.fn(() => 9001));
console.log(testRollingMath.getSum());
console.log(res.mockFunctions.getSum.mock.calls.length);
console.log(res.mockFunctions.getSum);

console.log(RollingMath);
RollingMath.mock.instances[0].getSum.mockImplementation(jest.fn(() => 9002));

console.log(testRollingMath.getSum());

// helper function to create alerts
function createAlert(data) {
  return Finding.fromObject({
    name: `Anomolous AAVE ${data.field}`,
    description: `Reserve: ${data.reserve}`,
    alertId: `AAVE-ANOMOLOUS-${data.field.toUpperCase()}`,
    severity: FindingSeverity.High,
    type: FindingType.Suspicious,
    metadata: JSON.stringify(data),
  }); 
}

// data fields we are interested in
const dataFields = [
  'availableLiquidity',
  'totalStableDebt',
  'totalVariableDebt',
  'totalDebt',
  'totalValueLocked',
];


