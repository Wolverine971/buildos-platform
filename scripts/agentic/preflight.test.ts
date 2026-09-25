// scripts/agentic/preflight.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertGateModelAllowed } from './preflight';

test('refuses acting models outside the cost allowlist and names the known spend', () => {
	assert.throws(
		() => assertGateModelAllowed({ AGENTIC_CHAT_OPENROUTER_MODEL: 'unbiased/pareto' }),
		/refused acting model "unbiased\/pareto" \(known three-repetition spend: about \$1\.66\)/
	);
	assert.throws(() => assertGateModelAllowed({}), /must set AGENTIC_CHAT_OPENROUTER_MODEL/);
	assert.deepEqual(
		assertGateModelAllowed({ AGENTIC_CHAT_OPENROUTER_MODEL: 'deepseek/deepseek-v4.1-flash' }),
		{ model: 'deepseek/deepseek-v4.1-flash', knownRunCostUsd: 0.29 }
	);
	assert.deepEqual(
		assertGateModelAllowed({
			AGENTIC_CHAT_OPENROUTER_MODEL: 'unbiased/pareto',
			AGENTIC_GATE_ALLOWED_MODELS: 'deepseek/deepseek-v4.1-flash, unbiased/pareto'
		}),
		{ model: 'unbiased/pareto', knownRunCostUsd: 1.66 }
	);
});
