import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const AGENTIC_CHAT_ROOT = fileURLToPath(new URL('../src/workers/agentic-chat/', import.meta.url));
const PROVIDER_ROOT = join(AGENTIC_CHAT_ROOT, 'provider');

const EXTRACTED_PROVIDER_MODULES = [
	'contracts.ts',
	'feedback.ts',
	'protocol.ts',
	'steps.ts',
	'stream-tool-calls.ts',
	'tool-surface.ts',
	'validation.ts',
	join('review', 'controls.ts')
] as const;

describe('Agentic Chat provider boundaries', () => {
	it('keeps provider contracts in the provider namespace', () => {
		expect(existsSync(join(AGENTIC_CHAT_ROOT, 'providerContract.ts'))).toBe(false);
		expect(existsSync(join(PROVIDER_ROOT, 'contracts.ts'))).toBe(true);
	});

	it('keeps extracted responsibilities out of the turn coordinator', () => {
		const coordinator = readFileSync(join(PROVIDER_ROOT, 'turn-provider.ts'), 'utf8');
		const extractedDeclarations = [
			'function appendToolCallDelta(',
			'function buildPlanningStep(',
			'function productionToolsFor(',
			'function validateCompletedProviderCalls(',
			'function validateReadFeedback(',
			'const TURN_CONTRACT_REVIEW_APPROVAL_TOOL'
		] as const;

		for (const declaration of extractedDeclarations) {
			expect(coordinator, declaration).not.toContain(declaration);
		}
	});

	it('keeps extracted provider modules independent of the coordinator', () => {
		for (const relativePath of EXTRACTED_PROVIDER_MODULES) {
			const path = join(PROVIDER_ROOT, relativePath);
			expect(existsSync(path), relativePath).toBe(true);
			expect(readFileSync(path, 'utf8'), relativePath).not.toMatch(
				/from\s+['"][^'"]*turn-provider['"]/
			);
		}
	});
});
