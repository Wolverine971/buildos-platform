// apps/worker/tests/agenticChatPromptDump.test.ts
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	localPromptDumpsEnabled,
	startLocalPromptDump
} from '../src/workers/agentic-chat/promptDump';

const env = { NODE_ENV: 'development', AGENTIC_CHAT_LOCAL_PROMPT_DUMPS: 'true' };
const identity = {
	sessionId: 'session-1',
	turnRunId: 'turn-1',
	streamRunId: 'stream-1',
	clientTurnId: 'client-1',
	executionGeneration: 2,
	logicalProviderRound: 3,
	providerRound: 'continuation',
	passRole: 'contract_review',
	providerAttempt: 2,
	routeId: 'openrouter',
	usageLogId: 'usage-1'
};
const directories: string[] = [];
const directory = () => {
	const dir = mkdtempSync(join(tmpdir(), 'worker-prompts-'));
	directories.push(dir);
	return dir;
};
afterEach(() => {
	directories.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
	directories.length = 0;
	vi.restoreAllMocks();
});

describe('worker local prompt dumps', () => {
	it.each([
		{ NODE_ENV: 'production' },
		{ NODE_ENV: 'test' },
		{ NODE_ENV: undefined },
		{ AGENTIC_CHAT_LOCAL_PROMPT_DUMPS: 'false' },
		{ AGENTIC_CHAT_LOCAL_PROMPT_DUMPS: undefined },
		{ VITEST: 'true' },
		{ RAILWAY_ENVIRONMENT_ID: 'hosted' },
		{ RAILWAY_ENVIRONMENT_NAME: 'production' },
		{ RAILWAY_SERVICE_ID: 'chat' }
	])('never writes in disabled or hosted environments: %j', (overrides) => {
		const dir = directory();
		expect(localPromptDumpsEnabled({ ...env, ...overrides })).toBe(false);
		expect(
			startLocalPromptDump(identity, '{}', { env: { ...env, ...overrides }, directory: dir })
		).toBeNull();
		expect(readdirSync(dir)).toEqual([]);
	});

	it('preserves ordered messages, tools, request settings, response, and correlation in JSON and readable text', () => {
		const dir = directory();
		const request = {
			model: 'test/model',
			tools: [
				{ type: 'function', function: { name: 'review', parameters: { type: 'object' } } }
			],
			messages: [
				{ role: 'system', content: 'Review the candidate.\n```json\n{}\n```' },
				{ role: 'assistant', content: null, tool_calls: [{ id: 'call-1' }] },
				{ role: 'tool', content: '{"created":true}', tool_call_id: 'call-1' }
			],
			tool_choice: 'required',
			provider: { only: ['test'] },
			stream: true
		};
		const dump = startLocalPromptDump(identity, JSON.stringify(request), {
			env,
			directory: dir
		})!;
		const read = () => JSON.parse(readFileSync(join(dir, dump.jsonFile), 'utf8'));
		expect(read().request).toEqual(request);
		expect(read().outcome.status).toBe('pending');
		dump.recordEvent({ type: 'text', content: 'Approved' });
		dump.complete({ status: 'success', requestId: 'gen-123', usage: { cost: 0.01 } });
		expect(read()).toMatchObject({
			...identity,
			request,
			responseEvents: [{ type: 'text', content: 'Approved' }],
			outcome: { status: 'success', requestId: 'gen-123' }
		});
		const markdown = readFileSync(join(dir, dump.markdownFile), 'utf8');
		expect(markdown).toContain('Review the candidate.');
		expect(markdown).toContain('### 3. tool');
		expect(markdown).toContain('gen-123');
		expect(statSync(join(dir, dump.jsonFile)).mode & 0o777).toBe(0o600);
		expect(JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8')).jsonFile).toBe(
			dump.jsonFile
		);
	});

	it('does not overwrite attempts or move latest backwards when an older call finishes', () => {
		const dir = directory();
		const first = startLocalPromptDump(identity, '{}', { env, directory: dir })!;
		const second = startLocalPromptDump(identity, '{}', { env, directory: dir })!;
		expect(first.jsonFile).not.toBe(second.jsonFile);
		first.complete({ status: 'aborted' });
		expect(JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8')).jsonFile).toBe(
			second.jsonFile
		);
	});

	it('prunes only expired dump files and preserves manually saved notes', () => {
		const dir = directory();
		writeFileSync(join(dir, '2020-01-01T00-00-00.000Z--turn--test.json'), '{}');
		writeFileSync(join(dir, 'notes.md'), 'keep');
		startLocalPromptDump(identity, '{}', { env, directory: dir, now: Date.UTC(2030, 0, 1) });
		expect(readdirSync(dir)).not.toContain('2020-01-01T00-00-00.000Z--turn--test.json');
		expect(readdirSync(dir)).toContain('notes.md');
	});

	it('does not fail the model request when disk writes fail', () => {
		const dir = directory();
		const file = join(dir, 'not-a-directory');
		writeFileSync(file, '');
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(startLocalPromptDump(identity, '{}', { env, directory: file })).toBeNull();
		expect(warning).toHaveBeenCalledOnce();
	});
});
