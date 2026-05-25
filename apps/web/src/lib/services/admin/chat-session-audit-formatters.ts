// apps/web/src/lib/services/admin/chat-session-audit-formatters.ts
export function formatDateTime(value: string | null | undefined): string {
	if (!value) return '-';
	return new Date(value).toLocaleString();
}

export function formatNumber(value: number | null | undefined): string {
	return new Intl.NumberFormat('en-US').format(value ?? 0);
}

export function formatCurrency(value: number | null | undefined): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 4,
		maximumFractionDigits: 4
	}).format(value ?? 0);
}

export function formatDuration(ms: unknown): string {
	const value = typeof ms === 'number' ? ms : Number(ms);
	if (!Number.isFinite(value) || value <= 0) return '-';
	if (value < 1000) return `${Math.round(value)}ms`;
	return `${(value / 1000).toFixed(2)}s`;
}

export function prettyJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export function truncateText(value: string, max = 220): string {
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	if (normalized.length <= max) return normalized;
	return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return count === 1 ? singular : plural;
}
