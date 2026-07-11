// apps/web/src/lib/services/loop-telemetry.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./posthog', () => ({
	captureEvent: vi.fn()
}));

import { captureEvent } from './posthog';
import { trackLoopEvent } from './loop-telemetry';

describe('trackLoopEvent', () => {
	beforeEach(() => {
		vi.mocked(captureEvent).mockClear();
	});

	it('stamps the loop envelope (surface + actor_kind) onto every event', () => {
		trackLoopEvent('loop_capture_submitted', 'today', {
			source_type: 'quick_capture',
			capture_length: 42
		});

		expect(captureEvent).toHaveBeenCalledWith('loop_capture_submitted', {
			surface: 'today',
			actor_kind: 'user',
			source_type: 'quick_capture',
			capture_length: 42
		});
	});

	it('sends the bare envelope when no properties are given', () => {
		trackLoopEvent('loop_surface_shown', 'today');

		expect(captureEvent).toHaveBeenCalledWith('loop_surface_shown', {
			surface: 'today',
			actor_kind: 'user'
		});
	});
});
