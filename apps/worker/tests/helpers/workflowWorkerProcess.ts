// apps/worker/tests/helpers/workflowWorkerProcess.ts
//
// DISPOSABLE DATABASE ONLY. A real, separate worker process for the Tasker 87 restart
// proof (`agenticChatWorkflowRestart.postgres.test.ts`). It leases and claims one admitted
// v4 turn on the parent's socket-only disposable PostgreSQL, then runs the real worker
// path (preparation, durable runner, stream publisher, terminal writer) with the real
// OpenRouter client on the production workflow routes. The client's HTTPS base URL is
// forwarded over plain HTTP to a stub the parent test serves on 127.0.0.1, so no request
// can leave the machine and no paid call is possible. The parent ends it with SIGKILL.
//
// Run: node --import tsx --conditions=development tests/helpers/workflowWorkerProcess.ts
import { Client } from 'pg';
import { AgenticChatPendingEffectsRegistry } from '../../src/workers/agentic-chat/pendingEffects';
import { AgenticChatOpenRouterClient } from '../../src/workers/agentic-chat/provider/openrouter-client';
import { buildAgenticChatWorkflowRoutesV1 } from '../../src/workers/agentic-chat/workflow/workflow-dispatch';
import { buildE2EWorker, leaseAndClaimE2E } from './workflowEndToEnd';
import { type DisposableConnection, createPgSupabaseShim, serviceClient } from './workflowPostgres';

const STUB_ORIGIN = 'https://openrouter.stub';

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

function report(value: Record<string, unknown>): void {
	process.stdout.write(
		`${JSON.stringify({ pid: process.pid, at: new Date().toISOString(), ...value })}\n`
	);
}

async function main(): Promise<void> {
	const connection = JSON.parse(requireEnv('WORKFLOW_PG_CONNECTION')) as DisposableConnection;
	const turnRunId = requireEnv('WORKFLOW_TURN_RUN_ID');
	const stub = requireEnv('WORKFLOW_PROVIDER_STUB_ORIGIN');
	// Guards: a socket-only disposable database and a loopback stub, nothing else.
	if (!connection.host.startsWith('/'))
		throw new Error('A socket-only disposable PostgreSQL is required');
	if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(stub))
		throw new Error('The provider stub must be on loopback');

	const admin = new Client(connection);
	await admin.connect();
	const service = await serviceClient(connection);
	const shim = createPgSupabaseShim(service);
	const fetchImpl = ((url: string | URL, init?: RequestInit) => {
		const target = String(url);
		if (!target.startsWith(`${STUB_ORIGIN}/`)) {
			throw new Error(`Unexpected provider URL ${target}`);
		}
		return fetch(`${stub}${target.slice(STUB_ORIGIN.length)}`, init);
	}) as typeof fetch;
	const client = new AgenticChatOpenRouterClient(
		{
			usage: { observe: () => undefined },
			pendingEffects: new AgenticChatPendingEffectsRegistry()
		},
		{
			routes: buildAgenticChatWorkflowRoutesV1([
				{
					id: 'openrouter',
					kind: 'openrouter',
					baseUrl: `${STUB_ORIGIN}/api/v1`,
					apiKey: 'stub-secret',
					model: 'deepseek/deepseek-v4.1-flash',
					fallbackModels: []
				}
			]),
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Agentic Chat Worker',
			fetchImpl,
			requestTimeoutMs: 90_000,
			responseHeadersTimeoutMs: 10_000
		}
	);

	const lease = await leaseAndClaimE2E(admin, shim, turnRunId);
	report({ event: 'claimed', executionGeneration: lease.claim.executionGeneration });
	const worker = buildE2EWorker({ shim, client });
	const result = await worker.execute(lease);
	await worker.stop();
	report({ event: 'finished', result });
	await service.end();
	await admin.end();
}

main().catch((error: unknown) => {
	report({ event: 'error', error: error instanceof Error ? error.message : String(error) });
	process.exitCode = 1;
});
