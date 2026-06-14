// packages/buildos-mcp-server/src/config.ts

export const BRIDGE_NAME = 'buildos-mcp-stdio-bridge';
export const BRIDGE_VERSION = '0.1.0';
export const DEFAULT_BASE_URL = 'https://build-os.com';

const ALLOWED_PROFILES = new Set(['general', 'chatgpt_data_app', 'local_admin']);

export type BridgeConfig = {
	baseUrl: string;
	token: string;
	profile?: string;
};

/**
 * Build the bridge config from environment variables. Secrets come from the
 * environment only — never from CLI args or chat input.
 *
 *  - `BUILDOS_BASE_URL`   optional, defaults to https://build-os.com
 *  - `BUILDOS_AGENT_TOKEN` required — a BuildOS agent key (`boca_...`) or OAuth token
 *  - `BUILDOS_MCP_PROFILE` optional — general | chatgpt_data_app | local_admin
 */
export function loadConfig(env: NodeJS.ProcessEnv): BridgeConfig {
	const baseUrlRaw = (env.BUILDOS_BASE_URL ?? DEFAULT_BASE_URL).trim();
	const baseUrl = baseUrlRaw.replace(/\/+$/, '');
	if (!/^https?:\/\//.test(baseUrl)) {
		throw new Error(
			`BUILDOS_BASE_URL must be an http(s) URL (got "${baseUrlRaw || '<empty>'}")`
		);
	}

	const token = (env.BUILDOS_AGENT_TOKEN ?? '').trim();
	if (!token) {
		throw new Error('BUILDOS_AGENT_TOKEN is required (a BuildOS agent key or OAuth token)');
	}

	const profile = env.BUILDOS_MCP_PROFILE?.trim();
	if (profile && !ALLOWED_PROFILES.has(profile)) {
		throw new Error(
			`BUILDOS_MCP_PROFILE must be one of: ${[...ALLOWED_PROFILES].join(', ')} (got "${profile}")`
		);
	}

	return {
		baseUrl,
		token,
		...(profile ? { profile } : {})
	};
}
