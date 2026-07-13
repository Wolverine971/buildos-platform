// apps/web/src/lib/tests/agentic-e2e/harness/env.ts
//
// Loads + validates the environment the agentic e2e harness needs. Fails loudly
// with actionable messages so a misconfigured run explains itself.
import { env as privateEnv } from '$env/dynamic/private';

export interface HarnessEnv {
	baseUrl: string;
	testUserEmail: string;
	testUserPassword: string;
	openRouterApiKey: string;
}

function required(name: string, value: string | undefined): string {
	if (!value || !value.trim()) {
		throw new Error(
			`[agentic-e2e] Missing ${name}. Add it to apps/web/.env before running \`pnpm test:agentic\`.`
		);
	}
	return value.trim();
}

let cached: HarnessEnv | null = null;

export function loadHarnessEnv(): HarnessEnv {
	if (cached) return cached;

	cached = {
		baseUrl: (privateEnv.AGENTIC_E2E_BASE_URL || 'http://localhost:5173').replace(/\/$/, ''),
		testUserEmail: required('AGENTIC_TEST_USER_EMAIL', privateEnv.AGENTIC_TEST_USER_EMAIL),
		testUserPassword: required(
			'AGENTIC_TEST_USER_PASSWORD',
			privateEnv.AGENTIC_TEST_USER_PASSWORD
		),
		openRouterApiKey: required(
			'PRIVATE_OPENROUTER_API_KEY',
			privateEnv.PRIVATE_OPENROUTER_API_KEY
		)
	};

	return cached;
}
