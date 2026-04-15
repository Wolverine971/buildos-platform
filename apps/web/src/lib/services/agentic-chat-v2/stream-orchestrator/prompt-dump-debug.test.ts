// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/prompt-dump-debug.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { LITE_PROMPT_VARIANT } from '$lib/services/agentic-chat-lite/prompt';
import { FASTCHAT_PROMPT_VARIANT } from '../prompt-variant';
import { writeInitialPromptDump } from './prompt-dump-debug';

const originalCwd = process.cwd();
const originalDumpToggle = process.env.FASTCHAT_LOCAL_PROMPT_DUMPS;
const tempDirs: string[] = [];

afterEach(() => {
	process.chdir(originalCwd);
	if (originalDumpToggle === undefined) {
		delete process.env.FASTCHAT_LOCAL_PROMPT_DUMPS;
	} else {
		process.env.FASTCHAT_LOCAL_PROMPT_DUMPS = originalDumpToggle;
	}
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

function createTempCwd(): string {
	const dir = mkdtempSync(join(tmpdir(), 'fastchat-lite-dump-'));
	tempDirs.push(dir);
	return dir;
}

describe('writeInitialPromptDump', () => {
	it('includes lite section metadata when the lite prompt variant is selected', () => {
		const cwd = createTempCwd();
		process.chdir(cwd);
		process.env.FASTCHAT_LOCAL_PROMPT_DUMPS = 'true';

		const dumpPath = writeInitialPromptDump({
			dev: true,
			sessionId: 'lite-session',
			normalizedContext: 'global',
			history: [],
			message: 'What should I work on next?',
			systemPrompt: 'Lite system prompt',
			debugContext: {
				promptVariant: LITE_PROMPT_VARIANT,
				liteSections: [
					{
						id: 'identity_mission',
						title: 'Identity and Mission',
						kind: 'static',
						source: 'lite.static_frame',
						chars: 18,
						estimatedTokens: 5
					}
				],
				liteContextInventory: {
					focus: { contextType: 'global' }
				},
				liteToolsSummary: {
					contextType: 'global',
					totalTools: 7
				}
			}
		});

		expect(dumpPath).toBeTruthy();
		expect(basename(dumpPath as string)).toMatch(/^fb-.+-lite-turn1\.txt$/);
		const dumpText = readFileSync(dumpPath as string, 'utf-8');
		expect(dumpText).toContain('Prompt variant: lite_seed_v1');
		expect(dumpText).toContain('Turn:      1');
		expect(dumpText).toContain('END SYSTEM PROMPT (MODEL INPUT ABOVE)');
		expect(dumpText).toContain('DUMP-ONLY LITE SECTION BREAKDOWN (NOT SENT TO MODEL)');
		expect(dumpText).toContain('identity_mission - Identity and Mission');
		expect(dumpText).toContain('DUMP-ONLY LITE METADATA (NOT SENT TO MODEL)');
		expect(dumpText).toContain('Context inventory');
		expect(dumpText).toContain('Tools summary');
	});

	it('names fastchat dumps with the variant slug and current turn number', () => {
		const cwd = createTempCwd();
		process.chdir(cwd);
		process.env.FASTCHAT_LOCAL_PROMPT_DUMPS = 'true';

		const dumpPath = writeInitialPromptDump({
			dev: true,
			sessionId: 'fastchat-session',
			normalizedContext: 'global',
			history: [
				{ role: 'user', content: 'First turn' },
				{ role: 'assistant', content: 'First answer' }
			],
			message: 'Second turn',
			systemPrompt: 'FastChat system prompt',
			debugContext: {
				promptVariant: FASTCHAT_PROMPT_VARIANT
			}
		});

		expect(dumpPath).toBeTruthy();
		expect(basename(dumpPath as string)).toMatch(/^fb-.+-fastchat-turn2\.txt$/);
		const dumpText = readFileSync(dumpPath as string, 'utf-8');
		expect(dumpText).toContain('Prompt variant: fastchat_prompt_v1');
		expect(dumpText).toContain('Turn:      2');
	});
});
