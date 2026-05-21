// apps/worker/src/workers/brief/calendarBriefFormatting.ts
import type {
	CalendarBriefItem,
	CalendarBriefSection,
	CalendarBriefSourceLabel
} from './ontologyBriefTypes.js';

function normalizeMarkdownUrl(url: string | null | undefined): string | null {
	const trimmed = url?.trim();
	if (!trimmed) return null;
	if (/[\r\n<>]/.test(trimmed)) return null;
	if (/^https?:\/\//i.test(trimmed) || /^\/(?!\/)/.test(trimmed)) {
		return trimmed.replace(/\(/g, '%28').replace(/\)/g, '%29');
	}
	return null;
}

function formatMarkdownLink(label: string, url: string | null | undefined): string | null {
	const normalizedUrl = normalizeMarkdownUrl(url);
	if (!normalizedUrl) return null;
	const escapedLabel = label.replace(/([\\[\]])/g, '\\$1');
	return `[${escapedLabel}](${normalizedUrl})`;
}

function formatStrongText(text: string): string {
	return `**${text.replace(/\*/g, '\\*')}**`;
}

function formatTaskUrl(item: CalendarBriefItem): string | null {
	if (!item.projectId || !item.taskId) return null;
	const projectId = encodeURIComponent(item.projectId);
	const taskId = encodeURIComponent(item.taskId);
	return `/projects/${projectId}/tasks/${taskId}`;
}

function formatItemTitle(item: CalendarBriefItem): string {
	const taskUrl = formatTaskUrl(item);
	if (!taskUrl) return formatStrongText(item.title);

	const link = formatMarkdownLink(item.title, taskUrl);
	return link ? formatStrongText(link) : formatStrongText(item.title);
}

function formatProjectLink(item: CalendarBriefItem): string | null {
	if (!item.projectId || !item.projectName) return item.projectName;

	const projectId = encodeURIComponent(item.projectId);
	return formatMarkdownLink(item.projectName, `/projects/${projectId}`) ?? item.projectName;
}

function canLinkCalendarSource(item: CalendarBriefItem): boolean {
	return item.source === 'google' || item.source === 'google_legacy';
}

function formatCalendarSourceLabel(item: CalendarBriefItem): CalendarBriefSourceLabel | string {
	if (!canLinkCalendarSource(item)) {
		return item.sourceLabel;
	}

	return formatMarkdownLink(item.sourceLabel, item.externalLink) ?? item.sourceLabel;
}

function formatCalendarKindLabel(item: CalendarBriefItem): string | null {
	if (item.itemType !== 'task') return null;
	switch (item.itemKind) {
		case 'range':
			return 'Task block';
		case 'start':
			return 'Task start';
		case 'due':
			return 'Task due';
		case 'event':
			return 'Task event';
	}
}

export function formatCalendarBriefItem(item: CalendarBriefItem, includeDate: boolean): string {
	const timeLabel = includeDate ? `${item.displayDate}, ${item.displayTime}` : item.displayTime;
	const kindLabel = formatCalendarKindLabel(item);
	const syncFreshnessLabel = item.syncFreshness === 'stale' ? 'stale sync' : null;
	const details = [
		timeLabel,
		formatCalendarSourceLabel(item),
		syncFreshnessLabel,
		kindLabel,
		formatProjectLink(item)
	].filter(Boolean);
	return `- ${formatItemTitle(item)}\n  - ${details.join(' / ')}`;
}

function formatCalendarCounts(section: CalendarBriefSection, scope: 'today' | 'upcoming'): string {
	const counts = section.counts[scope];
	if (counts.total === 0) return '0 items';

	const pieces: string[] = [`${counts.total} item${counts.total === 1 ? '' : 's'}`];
	if (counts.google > 0) {
		pieces.push(`${counts.google} Google`);
	}
	if (counts.unconfirmedGoogle > 0) {
		pieces.push(`${counts.unconfirmedGoogle} unconfirmed Google`);
	}
	if (counts.internal > 0) {
		pieces.push(`${counts.internal} internal`);
	}
	if (counts.syncIssue > 0) {
		pieces.push(`${counts.syncIssue} sync issue${counts.syncIssue === 1 ? '' : 's'}`);
	}
	if (counts.staleGoogle > 0) {
		pieces.push(`${counts.staleGoogle} stale Google`);
	}
	return pieces.join(' / ');
}

export function formatCalendarSection(calendar: CalendarBriefSection): string {
	let section = `## Calendar\n\n`;

	if (calendar.todayTotal === 0 && calendar.upcomingTotal === 0) {
		section += `No calendar items today or in the next 7 days.\n\n`;
		return section;
	}

	section += `**Today:** ${formatCalendarCounts(calendar, 'today')}\n`;
	if (calendar.upcomingTotal > 0) {
		section += `**Upcoming:** ${formatCalendarCounts(calendar, 'upcoming')}\n`;
	}
	section += '\n';

	if (calendar.today.length > 0) {
		section += `### Today\n`;
		for (const item of calendar.today) {
			section += `${formatCalendarBriefItem(item, false)}\n`;
		}
		if (calendar.hiddenTodayCount > 0) {
			section += `- ... and ${calendar.hiddenTodayCount} more today\n`;
		}
		section += '\n';
	} else {
		section += `### Today\nNo calendar items today.\n\n`;
	}

	if (calendar.upcoming.length > 0) {
		section += `### Upcoming\n`;
		for (const item of calendar.upcoming) {
			section += `${formatCalendarBriefItem(item, true)}\n`;
		}
		if (calendar.hiddenUpcomingCount > 0) {
			section += `- ... and ${calendar.hiddenUpcomingCount} more upcoming\n`;
		}
		section += '\n';
	}

	return section;
}

export function formatProjectCalendarItems(
	items: CalendarBriefItem[],
	includeDate: boolean
): string {
	return items
		.slice(0, 5)
		.map((item) => formatCalendarBriefItem(item, includeDate))
		.join('\n');
}
