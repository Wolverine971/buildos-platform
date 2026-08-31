import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const init = vi.fn();
	const optInCapturing = vi.fn();
	const capture = vi.fn();
	return {
		hasAnalyticsConsent: vi.fn(),
		init,
		optInCapturing,
		capture,
		posthog: {
			init,
			opt_in_capturing: optInCapturing,
			capture
		}
	};
});

vi.mock('$app/environment', () => ({ browser: true, dev: false }));
vi.mock('$env/static/public', () => ({
	PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com',
	PUBLIC_POSTHOG_KEY: 'phc_test_project_token'
}));
vi.mock('./tracking-consent', () => ({
	hasAnalyticsConsent: mocks.hasAnalyticsConsent
}));
vi.mock('posthog-js', () => ({ default: mocks.posthog }));

type DispatchedReceipt = {
	type: string;
	detail: unknown;
};

describe('PostHog browser capture receipts', () => {
	let dispatched: DispatchedReceipt[];

	beforeEach(() => {
		vi.resetModules();
		mocks.hasAnalyticsConsent.mockReset().mockReturnValue(true);
		mocks.init.mockReset();
		mocks.optInCapturing.mockReset();
		mocks.capture.mockReset().mockReturnValue({
			uuid: '019f0000-0000-7000-8000-000000000001',
			event: 'agentic_chat_admission_completed',
			properties: {}
		});
		dispatched = [];

		vi.stubGlobal('window', {
			dispatchEvent: vi.fn((event: DispatchedReceipt) => {
				dispatched.push(event);
				return true;
			})
		});
		vi.stubGlobal(
			'CustomEvent',
			class<T> {
				type: string;
				detail: T;

				constructor(type: string, init: { detail: T }) {
					this.type = type;
					this.detail = init.detail;
				}
			}
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reports consent-disabled capture without loading the SDK', async () => {
		mocks.hasAnalyticsConsent.mockReturnValue(false);
		const { captureEvent } = await import('./posthog');

		const receipt = await captureEvent(
			'agentic_chat_admission_completed',
			{ response_ok: true },
			{ delivery: 'immediate_beacon' }
		);

		expect(receipt).toEqual({
			event: 'agentic_chat_admission_completed',
			status: 'skipped',
			delivery: 'immediate_beacon',
			reason: 'analytics_consent_disabled'
		});
		expect(mocks.init).not.toHaveBeenCalled();
		expect(mocks.capture).not.toHaveBeenCalled();
		expect(dispatched).toEqual([
			{
				type: 'buildos:posthog-capture-receipt',
				detail: receipt
			}
		]);
	});

	it('bypasses batching with a nonblocking beacon and reports SDK acceptance', async () => {
		const { captureEvent } = await import('./posthog');
		const properties = { response_ok: true, worker_admission_ms: 144 };

		const receipt = await captureEvent('agentic_chat_admission_completed', properties, {
			delivery: 'immediate_beacon'
		});

		expect(mocks.init).toHaveBeenCalledWith(
			'phc_test_project_token',
			expect.objectContaining({
				api_host: 'https://us.i.posthog.com',
				opt_out_capturing_by_default: true,
				respect_dnt: true
			})
		);
		expect(mocks.optInCapturing).toHaveBeenCalledWith({ captureEventName: false });
		expect(mocks.capture).toHaveBeenCalledWith('agentic_chat_admission_completed', properties, {
			transport: 'sendBeacon',
			send_instantly: true
		});
		expect(receipt).toEqual({
			event: 'agentic_chat_admission_completed',
			status: 'accepted',
			delivery: 'immediate_beacon',
			reason: null
		});
		expect(dispatched).toEqual([
			{
				type: 'buildos:posthog-capture-receipt',
				detail: receipt
			}
		]);
		expect(JSON.stringify(dispatched)).not.toContain('worker_admission_ms');
		expect(JSON.stringify(dispatched)).not.toContain('response_ok');
	});

	it('reports initialization failure without rejecting the product call', async () => {
		mocks.init.mockImplementationOnce(() => {
			throw new Error('synthetic initialization failure');
		});
		const { captureEvent } = await import('./posthog');

		await expect(
			captureEvent('agentic_chat_admission_completed', undefined, {
				delivery: 'immediate_beacon'
			})
		).resolves.toMatchObject({
			status: 'skipped',
			reason: 'initialization_unavailable'
		});
		expect(mocks.capture).not.toHaveBeenCalled();
		expect(dispatched[0]?.detail).toMatchObject({
			status: 'skipped',
			reason: 'initialization_unavailable'
		});
	});

	it('distinguishes SDK rejection from a successful acceptance', async () => {
		mocks.capture.mockReturnValue(undefined);
		const { captureEvent } = await import('./posthog');

		const receipt = await captureEvent('agentic_chat_admission_completed', undefined, {
			delivery: 'immediate_beacon'
		});

		expect(receipt).toMatchObject({
			status: 'dropped',
			reason: 'sdk_rejected'
		});
		expect(dispatched[0]?.detail).toEqual(receipt);
	});

	it('contains capture exceptions and emits an error receipt', async () => {
		mocks.capture.mockImplementation(() => {
			throw new Error('synthetic capture failure');
		});
		const { captureEvent } = await import('./posthog');

		await expect(
			captureEvent('agentic_chat_admission_completed', undefined, {
				delivery: 'immediate_beacon'
			})
		).resolves.toMatchObject({
			status: 'error',
			reason: 'capture_exception'
		});
		expect(dispatched[0]?.detail).toMatchObject({
			status: 'error',
			reason: 'capture_exception'
		});
	});

	it('does not publish DOM receipts for non-allowlisted event names', async () => {
		const { captureEvent } = await import('./posthog');

		await expect(captureEvent('project_created')).resolves.toBeNull();
		expect(mocks.capture).toHaveBeenCalledWith('project_created', undefined, undefined);
		expect(dispatched).toEqual([]);
	});
});
