// apps/web/src/lib/components/dashboard/dashboard-presentation.ts
import type { DashboardChatSessionActivity } from '$lib/types/dashboard-analytics';
import { stripEntityReferences } from '$lib/utils/entity-reference-parser';
import { stripMarkdown } from '$lib/utils/markdown-text';

export function formatActivityDay(value: string, now = new Date()): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'Recent';
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (date.toDateString() === now.toDateString()) return 'Today';
	if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
	return date.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
	});
}

export function getDashboardChatPresentation(
	session: Pick<
		DashboardChatSessionActivity,
		'title' | 'summary' | 'project_name' | 'context_label' | 'last_activity_at'
	>
): { title: string; subtitle: string } {
	const context = session.project_name?.trim() || session.context_label;
	const title = session.title.trim();
	// Exact compatibility sentinel emitted by both the dashboard RPC and its
	// service fallback, not a heuristic for interpreting user-written language.
	// A manually chosen identical title only gets a different preview label.
	if (title && title !== 'Untitled chat session') return { title, subtitle: context };

	const summary = stripMarkdown(stripEntityReferences(session.summary ?? ''))
		.replace(/\s+/g, ' ')
		.trim();
	const date = new Date(session.last_activity_at);
	const timestamp = Number.isNaN(date.getTime())
		? ''
		: date.toLocaleString(undefined, {
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			});
	return {
		title: summary || (session.project_name ? `${context} chat` : context || 'Chat'),
		subtitle: [summary ? context : '', timestamp].filter(Boolean).join(' · ')
	};
}
