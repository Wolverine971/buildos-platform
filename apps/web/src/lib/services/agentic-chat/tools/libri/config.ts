// apps/web/src/lib/services/agentic-chat/tools/libri/config.ts
export const LIBRI_INTEGRATION_ENABLED_ENV = 'LIBRI_INTEGRATION_ENABLED';

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

export function configureLibriRuntimeEnv(source: EnvSource | null): void {
	if (!source) {
		runtimeEnvSource = null;
		return;
	}

	runtimeEnvSource = typeof source === 'function' ? source : () => source;
}

export function isLibriIntegrationEnabled(source: EnvLike = getRuntimeEnv()): boolean {
	const raw = source[LIBRI_INTEGRATION_ENABLED_ENV];
	if (!raw) return false;
	return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

export function isLibriToolName(toolName: string): boolean {
	return toolName === 'resolve_libri_resource' || toolName === 'query_libri_library';
}
