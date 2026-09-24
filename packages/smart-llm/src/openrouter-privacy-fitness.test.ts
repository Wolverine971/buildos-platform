// packages/smart-llm/src/openrouter-privacy-fitness.test.ts
//
// Repo fitness guard for tasker 103 (zero data retention on every AI call).
// Every source file that names a model-provider endpoint must be listed here
// with the policy identifier it applies, or a one-line reason it is exempt.
// Direct OpenAI and Moonshot endpoints bypass OpenRouter's ZDR routing and may
// not appear anywhere. The patterns match URL literals, a structured format.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const OPENROUTER_API_URL = /openrouter\.ai\/api/;
const DIRECT_PROVIDER_URLS = [/api\.openai\.com/, /api\.moonshot\.ai/];

const AUDIO_EXCEPTION =
	'DJ 2026-09-24: OpenAI audio models have no ZDR endpoint; disclosed on /privacy as the one exception';

type AllowlistEntry = {
	/** Identifier that proves the file applies the private provider policy; null = exempt. */
	policy: string | null;
	reason: string;
};

const OPENROUTER_ALLOWLIST: Record<string, AllowlistEntry> = {
	'packages/smart-llm/src/smart-llm-service.ts': {
		policy: 'buildOpenRouterChatCompletionBody',
		reason: `Chat, JSON, and stream bodies use the enforcing builder. Transcription path: ${AUDIO_EXCEPTION}.`
	},
	'packages/smart-llm/src/jev-client.ts': {
		policy: 'JEV_PROVIDER_POLICY',
		reason: 'Every Jev decisions body carries the shared Jev provider policy.'
	},
	'packages/shared-agent-ops/src/embeddings/openai-embeddings.ts': {
		policy: 'OPENROUTER_EMBEDDINGS_PROVIDER',
		reason: 'Every embeddings body carries deny + zdr; the package cannot import smart-llm.'
	},
	'apps/web/src/lib/services/openrouter-v2/client.ts': {
		policy: 'buildOpenRouterChatCompletionBody',
		reason: 'Builds every web OpenRouterV2 chat body with the enforcing builder.'
	},
	'apps/web/src/lib/services/openrouter-v2-service.ts': {
		policy: null,
		reason: 'Default base URL only; every request goes through openrouter-v2/client.ts.'
	},
	'apps/worker/src/workers/agentic-chat/host/config.ts': {
		policy: null,
		reason: 'Default base URL only; open-route.ts writes OPENROUTER_PRIVATE_PROVIDER on every body.'
	},
	'apps/worker/src/workers/agentic-chat/provider/jev-tool-selector.ts': {
		policy: 'JEV_PROVIDER_POLICY',
		reason: 'Tool-selection Jev body carries the shared Jev provider policy.'
	},
	'apps/worker/src/workers/assets/assetOcrWorker.ts': {
		policy: 'OPENROUTER_PRIVATE_PROVIDER',
		reason: 'Image OCR body carries the private provider policy.'
	},
	'apps/worker/src/workers/libri/ocrProvider.ts': {
		policy: 'OPENROUTER_PRIVATE_PROVIDER',
		reason: 'Libri OCR body carries the private provider policy.'
	},
	'apps/worker/src/workers/question-tree/questionTreeModelAdapter.ts': {
		policy: 'OpenRouterClient',
		reason: 'Calls OpenRouterClient.callOpenRouter, whose body comes from the enforcing builder.'
	},
	'apps/worker/src/workers/agent-run/agentRunCostReconciler.ts': {
		policy: null,
		reason: 'GET /generation by id for cost reconciliation; sends no user content.'
	},
	'apps/worker/src/lib/tts/openrouter.ts': {
		policy: null,
		reason: `Daily brief narration (data_collection=deny only). ${AUDIO_EXCEPTION}.`
	},
	// The disclosed audio exception reaches OpenRouter through smart-llm's
	// transcription path rather than a URL literal of its own; listed so it stays visible.
	'apps/web/src/routes/api/transcribe/+server.ts': {
		policy: null,
		reason: `Voice dictation via SmartLLMService.transcribeAudio. ${AUDIO_EXCEPTION}.`
	},
	'apps/worker/src/workers/voice-notes/voiceNoteTranscriptionWorker.ts': {
		policy: null,
		reason: `Voice note transcription via SmartLLMService.transcribeAudio. ${AUDIO_EXCEPTION}.`
	}
};

const SOURCE_EXTENSIONS = /\.(ts|mts|cts|js|mjs|cjs|svelte)$/;
const SKIPPED_DIRECTORIES = new Set([
	'node_modules',
	'dist',
	'.svelte-kit',
	'__tests__',
	'fixtures'
]);
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]s$/;

function listSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			return SKIPPED_DIRECTORIES.has(entry.name) ? [] : listSourceFiles(entryPath);
		}
		return entry.isFile() && SOURCE_EXTENSIONS.test(entry.name) && !TEST_FILE.test(entry.name)
			? [entryPath]
			: [];
	});
}

function sourceRoots(): string[] {
	return ['apps', 'packages'].flatMap((group) =>
		readdirSync(path.join(repoRoot, group), { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(repoRoot, group, entry.name, 'src'))
			.filter((root) => existsSync(root))
	);
}

describe('OpenRouter privacy fitness', { timeout: 30_000 }, () => {
	const files = sourceRoots().flatMap(listSourceFiles);
	const sources = files.map((filePath) => ({
		relative: path.relative(repoRoot, filePath).split(path.sep).join('/'),
		text: readFileSync(filePath, 'utf8')
	}));

	it('scans the app and package sources', () => {
		expect(sources.some((file) => file.relative.startsWith('apps/web/src/'))).toBe(true);
		expect(sources.some((file) => file.relative.startsWith('apps/worker/src/'))).toBe(true);
		expect(sources.some((file) => file.relative.startsWith('packages/smart-llm/src/'))).toBe(
			true
		);
	});

	it('never references a direct OpenAI or Moonshot endpoint', () => {
		const violations = sources
			.filter((file) => DIRECT_PROVIDER_URLS.some((pattern) => pattern.test(file.text)))
			.map((file) => file.relative);
		expect(violations).toEqual([]);
	});

	it('names the OpenRouter API only in allowlisted files', () => {
		const unlisted = sources
			.filter((file) => OPENROUTER_API_URL.test(file.text))
			.map((file) => file.relative)
			.filter((relative) => !(relative in OPENROUTER_ALLOWLIST));
		expect(unlisted).toEqual([]);
	});

	it('keeps every allowlist entry current, reasoned, and applying its policy', () => {
		const problems: string[] = [];
		for (const [relative, entry] of Object.entries(OPENROUTER_ALLOWLIST)) {
			const source = sources.find((file) => file.relative === relative);
			if (!source) {
				problems.push(`${relative}: listed but not a scanned source file`);
				continue;
			}
			if (!entry.reason.trim() || entry.reason.includes('\n')) {
				problems.push(`${relative}: needs a one-line reason`);
			}
			if (entry.policy && !source.text.includes(entry.policy)) {
				problems.push(`${relative}: no longer references ${entry.policy}`);
			}
		}
		expect(problems).toEqual([]);
	});
});
