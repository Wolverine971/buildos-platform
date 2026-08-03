import { describe, expect, it } from 'vitest';
import { sessionFlowBarPosition } from './chat-session-flow-geometry';

describe('chat-session-flow-geometry', () => {
	it('keeps minimum-width bars inside the right edge', () => {
		expect(
			sessionFlowBarPosition({
				start: 999,
				length: 1,
				total: 1000,
				minWidthPercent: 0.8
			})
		).toEqual({ left: '99.9%', width: '0.1%' });
	});

	it('clamps point markers to the available scale', () => {
		expect(
			sessionFlowBarPosition({
				start: 1200,
				length: 0,
				total: 1000,
				minWidthPercent: 0.8,
				isPoint: true
			})
		).toEqual({ left: '100%' });
	});
});
