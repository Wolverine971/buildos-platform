import { env } from '$env/dynamic/private';

export const LIBRI_INTEGRATION_ENABLED_ENV = 'LIBRI_INTEGRATION_ENABLED';

type EnvLike = Record<string, string | undefined>;

export function isLibriIntegrationEnabled(source: EnvLike = env): boolean {
	const raw = source[LIBRI_INTEGRATION_ENABLED_ENV];
	if (!raw) return false;
	return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

export function isLibriToolName(toolName: string): boolean {
	return toolName === 'resolve_libri_resource';
}
