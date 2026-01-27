// apps/web/src/lib/services/calendar-items.service.ts
import { requireApiData } from '$lib/utils/api-client-helpers';
import type { CalendarItem } from '$lib/types/calendar-items';

export interface CalendarItemsQuery {
	start: string;
	end: string;
	includeEvents?: boolean;
	includeTaskRange?: boolean;
	includeTaskStart?: boolean;
	includeTaskDue?: boolean;
	projectIds?: string[] | null;
	limit?: number | null;
}

export async function fetchCalendarItems(params: CalendarItemsQuery): Promise<CalendarItem[]> {
	const searchParams = new URLSearchParams();
	searchParams.set('start', params.start);
	searchParams.set('end', params.end);
	searchParams.set('include_events', String(params.includeEvents ?? true));
	searchParams.set('include_task_range', String(params.includeTaskRange ?? true));
	searchParams.set('include_task_start', String(params.includeTaskStart ?? true));
	searchParams.set('include_task_due', String(params.includeTaskDue ?? true));

	if (params.projectIds && params.projectIds.length > 0) {
		searchParams.set('project_ids', JSON.stringify(params.projectIds));
	}

	if (params.limit) {
		searchParams.set('limit', String(params.limit));
	}

	const response = await fetch(`/api/calendar/items?${searchParams.toString()}`);
	const data = await requireApiData<{ items: CalendarItem[] }>(
		response,
		'Failed to fetch calendar items'
	);

	return data.items ?? [];
}
