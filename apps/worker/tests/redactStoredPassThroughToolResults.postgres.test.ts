// apps/worker/tests/redactStoredPassThroughToolResults.postgres.test.ts
//
// DISPOSABLE DATABASE ONLY. Runs migration 20260924190200 against a socket-only
// local PostgreSQL (initdb) with a minimal fixture: the three tables it rewrites
// and their immutability/validation triggers under their real names. Proves the
// calendar and web rows are rewritten, tool arguments (ledger and tool_call
// events) are left exactly as written, workspace rows are kept, the triggers are
// restored, and a second run changes nothing.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const describePostgres = postgresAvailable ? describe : describe.skip;
const MIGRATION = resolve(
	__dirname,
	'../../../supabase/migrations/20260924190200_redact_stored_pass_through_tool_results.sql'
);

const FIXTURE = `
SET client_min_messages = warning;
CREATE TABLE public.chat_tool_executions (
	id uuid PRIMARY KEY, tool_name text, arguments jsonb, result jsonb);
CREATE TABLE public.chat_turn_events (
	id uuid PRIMARY KEY, event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}');
CREATE TABLE public.chat_turn_stream_state (
	turn_run_id uuid PRIMARY KEY, projection jsonb NOT NULL DEFAULT '{}',
	updated_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION public.validate_agentic_chat_turn_event_write() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
	IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'agentic_chat_turn_event_is_immutable'; END IF;
	RETURN NEW;
END $$;
CREATE TRIGGER trg_chat_turn_events_validate BEFORE INSERT OR UPDATE ON public.chat_turn_events
	FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_turn_event_write();
-- Stands in for a generation check the rewrite must not depend on.
CREATE FUNCTION public.validate_agentic_chat_stream_state_write() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
	IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'agentic_chat_stream_state_generation_mismatch'; END IF;
	RETURN NEW;
END $$;
CREATE TRIGGER trg_chat_turn_stream_state_validate BEFORE INSERT OR UPDATE ON public.chat_turn_stream_state
	FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_stream_state_write();
`;

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const googleCalendarResult = {
	events: [
		{
			source: 'google',
			external_event_id: 'g-1',
			title: 'Therapy with Dr. Reyes',
			event: { summary: 'Therapy with Dr. Reyes', description: 'Bring the intake form' }
		}
	],
	google_event_count: 1
};
const webVisitResult = {
	url: 'https://shop.example/refunds',
	title: 'Refunds',
	content: 'Refunds within 30 days of delivery'
};
const workspaceResult = { document: { id: 'd-1', title: 'Pitch deck', content: 'Slide one' } };
const buildosEventResult = { source: 'ontology', event: { id: 'e-1', title: 'Pitch rehearsal' } };

function toolResultEvent(toolName: string, result: unknown) {
	return {
		type: 'tool_result',
		result: { tool_call_id: `call-${toolName}`, success: true, tool_name: toolName, result }
	};
}

const navigateProgress = {
	type: 'tool_progress',
	tool_name: 'web_navigate',
	tool_call_id: 'call-nav',
	step_index: 0,
	message: 'Jev: not here (4%) → "Help with my order" (91%)',
	data: {
		kind: 'decided',
		page: 1,
		url: 'https://shop.example',
		next: { label: 'Help with my order', url: 'https://shop.example/help' }
	}
};

const scanArguments = {
	window: 'last_7_days',
	looking_for: 'replies from Dr. Reyes about the biopsy',
	max_emails: 50,
	call_ref: 'scan1'
};
const webSearchArguments = { query: 'custody lawyer near Glen Burnie', max_results: 4 };
const workspaceArguments = { query: 'pitch deck' };

function toolCallEvent(toolName: string, args: string) {
	return {
		type: 'tool_call',
		tool_call: { id: `call-${toolName}`, function: { name: toolName, arguments: args } }
	};
}

async function availablePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() =>
				typeof address === 'object' && address
					? resolvePort(address.port)
					: reject(new Error('no port'))
			);
		});
	});
}

describePostgres('migration 20260924190200: redact stored pass-through tool results', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let client: Client;

	const runMigration = () =>
		execFileSync(
			'psql',
			[
				'-X',
				'-q',
				'-h',
				socketDir,
				'-p',
				String(port),
				'-U',
				'postgres',
				'-d',
				'postgres',
				'-v',
				'ON_ERROR_STOP=1',
				'-f',
				MIGRATION
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		);

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-tasker103-redaction-pg-');
		dataDir = join(tempDir, 'data');
		socketDir = join(tempDir, 'socket');
		mkdirSync(socketDir);
		port = await availablePort();
		execFileSync(
			'initdb',
			[
				'-D',
				dataDir,
				'--no-locale',
				'--encoding=UTF8',
				'--auth=trust',
				'--username=postgres'
			],
			{ stdio: 'pipe' }
		);
		const log = join(tempDir, 'postgres.log');
		try {
			execFileSync(
				'pg_ctl',
				[
					'-D',
					dataDir,
					'-l',
					log,
					'-o',
					`-p ${port} -k ${socketDir} -c listen_addresses=''`,
					'-w',
					'start'
				],
				{ stdio: 'pipe' }
			);
		} catch (error) {
			throw new Error(
				`Disposable PostgreSQL failed to start:\n${readFileSync(log, 'utf8')}`,
				{
					cause: error
				}
			);
		}
		client = new Client({ host: socketDir, port, user: 'postgres', database: 'postgres' });
		await client.connect();
		await client.query(FIXTURE);

		const executions: Array<[number, string, unknown]> = [
			[1, 'list_calendar_events', googleCalendarResult],
			[2, 'web_visit', webVisitResult],
			[3, 'get_onto_document_details', workspaceResult],
			[4, 'get_calendar_event_details', buildosEventResult],
			[5, 'search_email_messages', { messages: [{ subject: 'Signed contract' }] }],
			[6, 'web_search', null]
		];
		for (const [n, toolName, result] of executions) {
			await client.query(
				'INSERT INTO public.chat_tool_executions (id, tool_name, arguments, result) VALUES ($1, $2, $3, $4)',
				[
					ID(n),
					toolName,
					JSON.stringify({ url: 'https://shop.example' }),
					JSON.stringify(result)
				]
			);
		}
		const argumentRows: Array<[number, string, unknown]> = [
			[7, 'scan_email_inbox', scanArguments],
			[8, 'search_onto_tasks', workspaceArguments]
		];
		for (const [n, toolName, args] of argumentRows) {
			await client.query(
				'INSERT INTO public.chat_tool_executions (id, tool_name, arguments, result) VALUES ($1, $2, $3, NULL)',
				[ID(n), toolName, JSON.stringify(args)]
			);
		}
		const events: Array<[number, string, unknown]> = [
			[11, 'tool_result', toolResultEvent('list_calendar_events', googleCalendarResult)],
			[12, 'tool_result', toolResultEvent('web_visit', webVisitResult)],
			[13, 'tool_result', toolResultEvent('get_onto_document_details', workspaceResult)],
			[14, 'tool_progress', navigateProgress],
			[
				15,
				'tool_call',
				{
					type: 'tool_call',
					tool_call: { function: { name: 'web_visit', arguments: '{"url":"x"}' } }
				}
			],
			[16, 'tool_call', toolCallEvent('web_search', JSON.stringify(webSearchArguments))],
			[17, 'tool_call', toolCallEvent('web_navigate', 'goal: my refund, not json')],
			[
				18,
				'tool_call',
				toolCallEvent('search_onto_tasks', JSON.stringify(workspaceArguments))
			]
		];
		for (const [n, eventType, payload] of events) {
			await client.query(
				'INSERT INTO public.chat_turn_events (id, event_type, payload) VALUES ($1, $2, $3)',
				[ID(n), eventType, JSON.stringify(payload)]
			);
		}
		const projection = {
			version: 1,
			current_activity: navigateProgress.message,
			semantic_events: [
				{
					...toolResultEvent('get_onto_document_details', workspaceResult),
					event_type: 'tool_result'
				},
				{ ...navigateProgress, event_type: 'tool_progress' },
				{ ...toolResultEvent('web_visit', webVisitResult), event_type: 'tool_result' },
				{
					...toolCallEvent('web_search', JSON.stringify(webSearchArguments)),
					event_type: 'tool_call'
				}
			]
		};
		await client.query(
			`INSERT INTO public.chat_turn_stream_state (turn_run_id, projection, updated_at)
			VALUES ($1, $2, '2026-09-20T00:00:00Z')`,
			[ID(21), JSON.stringify(projection)]
		);
		runMigration();
	}, 60_000);

	afterAll(async () => {
		await client?.end().catch(() => undefined);
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	const executionResult = async (n: number) =>
		(
			await client.query('SELECT result FROM public.chat_tool_executions WHERE id = $1', [
				ID(n)
			])
		).rows[0].result;
	const eventPayload = async (n: number) =>
		(await client.query('SELECT payload FROM public.chat_turn_events WHERE id = $1', [ID(n)]))
			.rows[0].payload;

	it('rewrites calendar, web and email ledger rows and keeps workspace rows', async () => {
		expect(await executionResult(1)).toEqual({
			content_redacted: true,
			tool_name: 'list_calendar_events',
			redaction_notice: expect.stringMatching(/Google Calendar event details are not stored/)
		});
		expect(await executionResult(2)).toEqual({
			content_redacted: true,
			tool_name: 'web_visit',
			redaction_notice: expect.stringMatching(/Web content is not stored/)
		});
		expect((await executionResult(5)).redaction_notice).toMatch(/Email content is not stored/);
		expect(await executionResult(3)).toEqual(workspaceResult);
		expect(await executionResult(4)).toEqual(buildosEventResult);
		expect(await executionResult(6)).toBeNull();
		const { rows } = await client.query(
			'SELECT arguments FROM public.chat_tool_executions WHERE id = $1',
			[ID(2)]
		);
		expect(rows[0].arguments).toEqual({ url: 'https://shop.example' });
	});

	it('rewrites tool_result and web_navigate progress events and keeps the rest', async () => {
		const calendar = await eventPayload(11);
		expect(calendar.result.result).toMatchObject({
			content_redacted: true,
			tool_name: 'list_calendar_events'
		});
		expect(calendar.result.tool_call_id).toBe('call-list_calendar_events');
		expect((await eventPayload(12)).result.result.content_redacted).toBe(true);
		expect((await eventPayload(13)).result.result).toEqual(workspaceResult);
		const progress = await eventPayload(14);
		expect(progress.message).toBe('Web navigation step');
		expect(progress.data).toEqual({
			kind: 'decided',
			page: 1,
			url: 'https://shop.example',
			content_redacted: true
		});
		expect((await eventPayload(15)).tool_call.function.arguments).toBe('{"url":"x"}');
		const stored = JSON.stringify(
			(await client.query('SELECT payload FROM public.chat_turn_events')).rows
		);
		for (const content of ['Reyes', 'intake form', 'within 30 days', 'Help with my order']) {
			expect(stored).not.toContain(content);
		}
	});

	it('rewrites the stream projection copies and the progress activity line', async () => {
		const { rows } = await client.query(
			'SELECT projection, updated_at FROM public.chat_turn_stream_state WHERE turn_run_id = $1',
			[ID(21)]
		);
		const projection = rows[0].projection;
		expect(projection.current_activity).toBe('Web navigation step');
		expect(projection.semantic_events[0].result.result).toEqual(workspaceResult);
		expect(projection.semantic_events[1].message).toBe('Web navigation step');
		expect(projection.semantic_events[2].result.result.content_redacted).toBe(true);
		expect(JSON.stringify(projection)).not.toContain('within 30 days');
		expect(rows[0].updated_at.toISOString()).toBe('2026-09-20T00:00:00.000Z');
	});

	it('leaves tool arguments and tool_call events exactly as written', async () => {
		const argumentsOf = async (n: number) =>
			(
				await client.query(
					'SELECT arguments FROM public.chat_tool_executions WHERE id = $1',
					[ID(n)]
				)
			).rows[0].arguments;
		expect(await argumentsOf(7)).toEqual(scanArguments);
		expect(await argumentsOf(8)).toEqual(workspaceArguments);

		expect((await eventPayload(16)).tool_call.function.arguments).toBe(
			JSON.stringify(webSearchArguments)
		);
		expect((await eventPayload(17)).tool_call.function.arguments).toBe(
			'goal: my refund, not json'
		);
		expect((await eventPayload(18)).tool_call.function.arguments).toBe(
			JSON.stringify(workspaceArguments)
		);

		const { rows } = await client.query(
			'SELECT projection FROM public.chat_turn_stream_state WHERE turn_run_id = $1',
			[ID(21)]
		);
		expect(rows[0].projection.semantic_events[3].tool_call.function.arguments).toBe(
			JSON.stringify(webSearchArguments)
		);
	});

	it('restores the triggers and drops its helper functions', async () => {
		await expect(
			client.query(`UPDATE public.chat_turn_events SET payload = '{}' WHERE id = $1`, [
				ID(15)
			])
		).rejects.toThrow(/agentic_chat_turn_event_is_immutable/);
		await expect(
			client.query(`UPDATE public.chat_turn_stream_state SET projection = '{}'`)
		).rejects.toThrow(/generation_mismatch/);
		const { rows } = await client.query(
			`SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE 'tasker103_%'`
		);
		expect(rows[0].n).toBe(0);
	});

	it('is idempotent: a second run rewrites no row', async () => {
		const versions = async () =>
			(
				await client.query(`
					SELECT 'x' || id::text AS key, xmin::text AS version FROM public.chat_tool_executions
					UNION ALL SELECT 'e' || id::text, xmin::text FROM public.chat_turn_events
					UNION ALL SELECT 's' || turn_run_id::text, xmin::text FROM public.chat_turn_stream_state
					ORDER BY 1`)
			).rows;
		const before = await versions();
		runMigration();
		expect(await versions()).toEqual(before);
	});
});
