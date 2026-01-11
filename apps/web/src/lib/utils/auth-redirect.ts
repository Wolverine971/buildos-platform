// apps/web/src/lib/utils/auth-redirect.ts

export function normalizeRedirectPath(value: string | null | undefined): string | null {
	if (!value) return null;

	const trimmed = value.trim();
	if (!trimmed.startsWith('/')) return null;
	if (trimmed.startsWith('//')) return null;
	if (trimmed.includes('://')) return null;

	return trimmed;
}
