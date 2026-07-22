// apps/web/src/lib/services/agentic-chat/tools/email/config.ts
//
// Feature-flag gate for the Tier 1 read-only Gmail chat tools. Mirrors the Libri
// integration flag (see ../libri/config.ts): default OFF, enabled per-environment
// so the pilot can be turned on for a single deployment and killed independently
// of the profile-tab Gmail UI. The tool registry, definition surfacing, and
// on-demand materialization all consult this gate, so flag-off hides the tools
// everywhere (registry, tool_search, discovery, direct-call materialization).

export const EMAIL_CHAT_TOOLS_ENABLED_ENV = 'EMAIL_CHAT_TOOLS_ENABLED';

type EnvLike = Record<string, string | undefined>;
type EnvSource = EnvLike | (() => EnvLike);

let runtimeEnvSource: (() => EnvLike) | null = null;

function getProcessEnv(): EnvLike {
	if (typeof process === 'undefined' || !process.env) return {};
	return process.env;
}

function getRuntimeEnv(): EnvLike {
	return runtimeEnvSource?.() ?? getProcessEnv();
}

/**
 * Override the environment source (used by tests to toggle the flag without
 * mutating the real process env). Pass null to reset to `process.env`.
 */
export function configureEmailRuntimeEnv(source: EnvSource | null): void {
	if (!source) {
		runtimeEnvSource = null;
		return;
	}

	runtimeEnvSource = typeof source === 'function' ? source : () => source;
}

export function isEmailChatToolsEnabled(source: EnvLike = getRuntimeEnv()): boolean {
	const raw = source[EMAIL_CHAT_TOOLS_ENABLED_ENV];
	if (!raw) return false;
	return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

const EMAIL_TOOL_NAMES = new Set([
	'list_email_accounts',
	'search_email_messages',
	'get_email_message'
]);

export function isEmailToolName(toolName: string): boolean {
	return EMAIL_TOOL_NAMES.has(toolName);
}
