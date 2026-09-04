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
	/**
	 * Worker health origin used for the write-surface preflight
	 * (`requireAdvertisedMutationTools`). Null when unset — scenarios with
	 * `requiredMutationTools` then fail loudly instead of silently skipping it.
	 */
	workerHealthUrl: string | null;
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
		// 127.0.0.1, never localhost: Node resolves localhost to ::1 first while
		// `vite dev` binds IPv4 only, so the IPv6 attempt fails the whole run.
		baseUrl: (privateEnv.AGENTIC_E2E_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, ''),
		testUserEmail: required('AGENTIC_TEST_USER_EMAIL', privateEnv.AGENTIC_TEST_USER_EMAIL),
		testUserPassword: required(
			'AGENTIC_TEST_USER_PASSWORD',
			privateEnv.AGENTIC_TEST_USER_PASSWORD
		),
		openRouterApiKey: required(
			'PRIVATE_OPENROUTER_API_KEY',
			privateEnv.PRIVATE_OPENROUTER_API_KEY
		),
		workerHealthUrl:
			privateEnv.PRIVATE_AGENTIC_CHAT_WORKER_URL?.trim().replace(/\/$/, '') || null
	};

	return cached;
}
