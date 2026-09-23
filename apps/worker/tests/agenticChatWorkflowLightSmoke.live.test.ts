// Opt-in paid smoke: synthetic context + disposable PostgreSQL + real OpenRouter.
// AGENTIC_CHAT_PAID_LIGHT_SMOKE=yes test-gate run pnpm --filter @buildos/worker exec vitest run tests/agenticChatWorkflowLightSmoke.live.test.ts
// Never runs paid requests in the normal suite. No hosted database is accessed.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { Client } from 'pg';
import { expect, test } from 'vitest';
import { computeAgenticChatWorkflowReservationMicroUsdV1 } from '@buildos/shared-types';
import { AgenticChatPendingEffectsRegistry } from '../src/workers/agentic-chat/effects/pending-effects';
import {
	AgenticChatOpenRouterClient,
	type AgenticChatProviderUsageObservationV1
} from '../src/workers/agentic-chat/provider/openrouter-client';
import {
	AGENTIC_CHAT_WORKFLOW_REQUEST_TIMEOUT_MS,
	AGENTIC_CHAT_WORKFLOW_RESPONSE_HEADERS_TIMEOUT_MS,
	buildAgenticChatWorkflowRoutesV1
} from '../src/workers/agentic-chat/workflow/workflow-dispatch';
import {
	admitE2ETurn,
	buildE2EWorker,
	e2eFacts,
	leaseAndClaimE2E,
	seedE2EOwner
} from './helpers/workflowEndToEnd';
import {
	createPgSupabaseShim,
	postgresAvailable,
	serviceClient,
	startDisposableWorkflowPostgres
} from './helpers/workflowPostgres';
import { roleOf } from './helpers/workflowProviderScript';

const enabled = process.env.AGENTIC_CHAT_PAID_LIGHT_SMOKE === 'yes';
const BUDGET_MICRO_USD = 100_000;
const MAX_REQUESTS = 6;

test.skipIf(!enabled)(
	'completes a real project review below a ten-cent dispatch ceiling',
	async () => {
		expect(postgresAvailable, 'Local PostgreSQL is required; no hosted fallback').toBe(true);
		const repositoryRoot = resolve(process.cwd(), '../..');
		const env = parse(readFileSync(resolve(repositoryRoot, '.env.agentic-gate.local')));
		const apiKey = env.PRIVATE_OPENROUTER_API_KEY;
		if (!apiKey) throw new Error('Missing OpenRouter key in the isolated gate environment');
		const startedAt = new Date().toISOString();
		const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
		const calls: Array<{
			role: string;
			model: string;
			bytes: number;
			reservedMicroUsd: number;
		}> = [];
		const usage: AgenticChatProviderUsageObservationV1[] = [];
		let reservedMicroUsd = 0;
		// Never release this smoke-level reservation, even when a request fails or is cheap.
		// The running total bounds all outbound attempts, including concurrent specialists,
		// fallbacks, retries, and requests for which no usage receipt arrives.
		const boundedFetch: typeof fetch = async (input, init) => {
			const url = new URL(String(input));
			if (url.origin !== 'https://openrouter.ai')
				throw new Error('Unexpected smoke destination');
			if (url.pathname === '/api/v1/generation' && (!init?.method || init.method === 'GET')) {
				return fetch(input, init);
			}
			if (url.pathname !== '/api/v1/chat/completions' || init?.method !== 'POST') {
				throw new Error('Unexpected smoke endpoint');
			}
			const serialized = String(init.body);
			const body = JSON.parse(serialized);
			const price = body.provider?.max_price;
			if (!price || price.prompt !== 0.3 || price.completion !== 1.2 || price.request !== 0) {
				throw new Error('Missing workflow provider price ceiling');
			}
			if (body.tools?.length || body.tool_choice !== 'none') {
				throw new Error('Smoke review must be tool-free');
			}
			const bytes = Buffer.byteLength(serialized, 'utf8');
			const reservation = computeAgenticChatWorkflowReservationMicroUsdV1(
				bytes,
				body.max_tokens
			);
			if (calls.length >= MAX_REQUESTS || reservedMicroUsd + reservation > BUDGET_MICRO_USD) {
				throw new Error('Light-smoke budget exhausted before dispatch');
			}
			reservedMicroUsd += reservation;
			calls.push({
				role: roleOf(String(body.messages?.[0]?.content ?? '')),
				model: body.model,
				bytes,
				reservedMicroUsd: reservation
			});
			return fetch(input, init);
		};
		const pendingEffects = new AgenticChatPendingEffectsRegistry();
		const client = new AgenticChatOpenRouterClient(
			{
				usage: {
					observe: (observation) => {
						usage.push(observation);
					}
				},
				pendingEffects
			},
			{
				routes: buildAgenticChatWorkflowRoutesV1([
					{
						id: 'openrouter',
						kind: 'openrouter' as const,
						baseUrl: 'https://openrouter.ai/api/v1',
						apiKey,
						model: 'deepseek/deepseek-v4.1-flash'
					}
				]),
				httpReferer: 'https://build-os.com',
				appName: 'BuildOS Workflow Light Smoke',
				fetchImpl: boundedFetch,
				requestTimeoutMs: AGENTIC_CHAT_WORKFLOW_REQUEST_TIMEOUT_MS,
				responseHeadersTimeoutMs: AGENTIC_CHAT_WORKFLOW_RESPONSE_HEADERS_TIMEOUT_MS
			}
		);
		const pg = await startDisposableWorkflowPostgres(
			repositoryRoot,
			'buildos-workflow-light-pg-'
		);
		const admin = new Client(pg.connection);
		let service: Client | undefined;
		let worker: ReturnType<typeof buildE2EWorker> | undefined;
		let evidence: Record<string, unknown> = {};
		const domainSnapshot = async () => {
			const snapshot: Record<string, unknown> = {};
			for (const table of [
				'onto_projects',
				'onto_actors',
				'onto_project_members',
				'onto_assets'
			]) {
				const { rows } = await admin.query(
					`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`
				);
				snapshot[table] = rows;
			}
			return snapshot;
		};
		try {
			await admin.connect();
			service = await serviceClient(pg.connection);
			const shim = createPgSupabaseShim(service);
			await seedE2EOwner(admin);
			const before = await domainSnapshot();
			const turnRunId = await admitE2ETurn(shim, 1);
			const lease = await leaseAndClaimE2E(admin, shim, turnRunId);
			worker = buildE2EWorker({ shim, client });
			const result = await worker.execute(lease);
			await pendingEffects.drain(turnRunId, 10_000);
			const facts = await e2eFacts(admin, turnRunId);
			const after = await domainSnapshot();
			const { rows: saved } = await admin.query(
				`SELECT metadata FROM public.chat_messages WHERE id = $1`,
				[facts.messages[0]?.id]
			);
			evidence = {
				result,
				facts,
				savedAnswerMetadata: saved,
				domainUnchanged: JSON.stringify(before) === JSON.stringify(after)
			};
			expect(result).toMatchObject({ outcome: 'completed', terminalStatus: 'completed' });
			expect(facts.run).toMatchObject({
				terminal_outcome: 'complete',
				synthesis_status: 'accepted'
			});
			expect(facts.steps.every((step) => step.status === 'accepted')).toBe(true);
			expect(facts.messages).toHaveLength(1);
			expect(facts.messages[0]!.content).toMatch(/venue/i);
			expect(facts.events.filter((event) => event.event_type === 'done')).toHaveLength(1);
			expect(facts.effects).toBe(0);
			expect(facts.turn.mutation_reserved_at).toBeNull();
			expect(facts.turn.irreversible_boundary_at).toBeNull();
			expect(after).toEqual(before);
			expect(reservedMicroUsd).toBeLessThanOrEqual(BUDGET_MICRO_USD);
			expect(calls.length).toBeGreaterThanOrEqual(4);
			expect(facts.dispatches.every((dispatch) => dispatch.state === 'settled')).toBe(true);
		} finally {
			await worker?.stop();
			const directory = resolve(repositoryRoot, 'output/agentic-workflow-light-smoke');
			mkdirSync(directory, { recursive: true });
			const path = resolve(directory, `${startedAt.replace(/[:.]/g, '-')}.json`);
			writeFileSync(
				path,
				JSON.stringify(
					{
						startedAt,
						finishedAt: new Date().toISOString(),
						revision,
						budgetMicroUsd: BUDGET_MICRO_USD,
						reservedMicroUsd,
						calls,
						usage: usage.map(
							({
								status,
								modelUsed,
								provider,
								requestId,
								promptTokens,
								completionTokens,
								reasoningTokens,
								providerCost,
								costSource,
								error
							}) => ({
								status,
								modelUsed,
								provider,
								requestId,
								promptTokens,
								completionTokens,
								reasoningTokens,
								providerCost,
								costSource,
								error
							})
						),
						...evidence
					},
					null,
					2
				) + '\n',
				{ mode: 0o600 }
			);
			process.stdout.write(`Light-smoke evidence: ${path}\n`);
			await service?.end().catch(() => undefined);
			await admin.end().catch(() => undefined);
			pg.stop();
		}
	},
	360_000
);
