// apps/web/src/lib/services/agentic-chat-v2/prompt-dump-files.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneLocalPromptDumps, shouldWriteLocalPromptDump } from './prompt-dump-files';

const tempDirs: string[] = [];

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) {
			rmSync(dir, { recursive: true, force: true });
		}
	}
});

function createTempDumpDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'fastchat-prompt-dumps-'));
	tempDirs.push(dir);
	return dir;
}

describe('shouldWriteLocalPromptDump', () => {
	it('skips filesystem dumps in test-like environments by default', () => {
		expect(
			shouldWriteLocalPromptDump({
				dev: true,
				sessionId: 'session_1',
				historyCount: 0,
				message: 'show task help',
				env: { VITEST: 'true' }
			})
		).toBe(false);
	});

	it('skips known low-signal fixture prompts for synthetic session_1 turns', () => {
		expect(
			shouldWriteLocalPromptDump({
				dev: true,
				sessionId: 'session_1',
				historyCount: 0,
				message: 'organize unlinked docs',
				env: {}
			})
		).toBe(false);
	});

	it('still allows real sessions and non-fixture prompts in dev', () => {
		expect(
			shouldWriteLocalPromptDump({
				dev: true,
				sessionId: '6039158b-0b23-4446-a584-06b2d48439b2',
				historyCount: 0,
				message: 'What is happening with my projects?',
				env: {}
			})
		).toBe(true);
	});
});

describe('pruneLocalPromptDumps', () => {
	it('keeps the last five UTC calendar days and removes older dated dumps', () => {
		const dumpDir = createTempDumpDir();
		writeFileSync(join(dumpDir, 'fastchat-2026-04-03T12-00-00-000Z.txt'), 'old', 'utf-8');
		writeFileSync(join(dumpDir, 'fastchat-2026-04-04T12-00-00-000Z.txt'), 'keep', 'utf-8');
		writeFileSync(join(dumpDir, 'kimi-tool-calls-2026-04-02.jsonl'), 'old', 'utf-8');
		writeFileSync(join(dumpDir, 'fastchat-2026-04-08T12-00-00-000Z.txt'), 'keep', 'utf-8');

		const result = pruneLocalPromptDumps({
			dumpDir,
			now: new Date('2026-04-08T21:30:00.000Z'),
			env: {},
			force: true
		});

		expect(result.removedCount).toBe(2);
		expect(result.cutoffDate).toBe('2026-04-04');
		expect(readdirSync(dumpDir).sort()).toEqual([
			'fastchat-2026-04-04T12-00-00-000Z.txt',
			'fastchat-2026-04-08T12-00-00-000Z.txt'
		]);
	});
});
