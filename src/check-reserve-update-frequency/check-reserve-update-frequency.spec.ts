import { Finding, FindingSeverity, FindingType, HandleBlock, createBlockEvent } from 'forta-agent'
import agent from './check-reserve-update-frequency'

describe('long delay in updating AAVE reserve data', () => {
  let handleBlock: HandleBlock;

	const blockEvent = createBlockEvent({
		blockHash: "0xa",
		blockNumber: 1,
		block: {} as any
	})

	beforeAll(() => {
		handleBlock = agent.handleBlock
	})

  describe('configurations work for', () => {
    it('window size', () => {
    });

    it('standard deviation limit', () => {
    });

    it('minimum elements before triggering', () => {
    });
  });

  describe('doesn\'t alert when', () => {
  });

  describe('whenever you pass a block it', () => {
  });

  describe('alerts when', () => {
  });
});
