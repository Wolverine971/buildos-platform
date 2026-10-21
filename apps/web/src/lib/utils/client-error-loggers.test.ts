// apps/web/src/lib/utils/client-error-loggers.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ browser: true }));
vi.mock('$app/environment', () => ({
	get browser() {
		return mocks.browser;
	}
}));

const context = {
	endpoint: '/api/onto/invites/pending',
	method: 'GET',
	operation: 'pending_invites',
	projectId: 'project-1',
	entityType: 'project_invite',
	entityId: 'invite-1',
	metadata: { status: 500 }
};

describe.each(['auth', 'ontology'] as const)('%s error logger deferred dependencies', (kind) => {
	let getUser: ReturnType<typeof vi.fn>;
	let logError: ReturnType<typeof vi.fn>;
	let loadClient: ReturnType<typeof vi.fn>;
	let loadLogger: ReturnType<typeof vi.fn>;

	async function loadHelper() {
		return kind === 'auth'
			? (await import('./auth-client-logger')).logAuthClientError
			: (await import('./ontology-client-logger')).logOntologyClientError;
	}

	beforeEach(() => {
		vi.resetModules();
		mocks.browser = true;
		getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } });
		logError = vi.fn().mockResolvedValue(undefined);
		loadClient = vi.fn(() => ({ supabase: { auth: { getUser } } }));
		loadLogger = vi.fn(() => ({ ErrorLoggerService: { getInstance: () => ({ logError }) } }));
		vi.doMock('$lib/supabase', loadClient);
		vi.doMock('$lib/services/errorLogger.service', loadLogger);
	});

	afterEach(() => vi.restoreAllMocks());

	it('does not import the database or logging SDK merely to render a page', async () => {
		await loadHelper();
		expect(loadClient).not.toHaveBeenCalled();
		expect(loadLogger).not.toHaveBeenCalled();
	});

	it('preserves diagnostic context when an error actually occurs', async () => {
		const report = await loadHelper();
		const error = new Error('Request failed');
		await report(error, context);
		expect(logError).toHaveBeenCalledWith(
			error,
			expect.objectContaining({
				userId: 'user-1',
				endpoint: context.endpoint,
				httpMethod: 'GET',
				operationType: 'pending_invites',
				...(kind === 'ontology' ? { projectId: 'project-1', recordId: 'invite-1' } : {}),
				metadata: expect.objectContaining({ source: `${kind}_ui`, status: 500 })
			})
		);
	});

	it('still reports errors when the auth lookup fails', async () => {
		getUser.mockRejectedValue(new Error('Auth unavailable'));
		await (
			await loadHelper()
		)(new Error('Original error'), context);
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ userId: undefined })
		);
	});

	it('does not import browser dependencies during SSR', async () => {
		mocks.browser = false;
		await (
			await loadHelper()
		)(new Error('SSR error'), context);
		expect(loadClient).not.toHaveBeenCalled();
		expect(loadLogger).not.toHaveBeenCalled();
	});

	it('contains a failed dynamic import instead of rejecting the fire-and-forget call', async () => {
		loadClient.mockImplementation(() => {
			throw new Error('Chunk unavailable');
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			(await loadHelper())(new Error('Original error'), context)
		).resolves.toBeUndefined();
		expect(logError).not.toHaveBeenCalled();
	});
});
