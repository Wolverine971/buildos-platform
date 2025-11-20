import { hasMarkdownFormatting } from '$lib/utils/markdown';

export function formatTime(date: Date): string {
	return date.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit'
	});
}

export function formatTokensEstimate(value?: number | null): string {
	if (value === undefined || value === null || Number.isNaN(value)) return '0';
	if (value >= 10000) return `${Math.round(value / 1000)}k`;
	if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
	return Math.round(value).toLocaleString();
}

export function formatCompressionTimestamp(timestamp?: string | null): string {
	if (!timestamp) return 'Not yet compressed';
	const parsed = new Date(timestamp);
	if (Number.isNaN(parsed.getTime())) return 'Unknown';
	const diffMs = Date.now() - parsed.getTime();
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return 'Just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function shouldRenderAsMarkdown(content: string): boolean {
	return hasMarkdownFormatting(content);
}
