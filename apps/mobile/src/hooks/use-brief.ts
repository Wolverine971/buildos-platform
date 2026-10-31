// apps/mobile/src/hooks/use-brief.ts
import type { DailyBrief, DailyBriefListItem } from '@buildos/api-client';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { isWriting } from '@/lib/brief';
import { useAuth } from '@/providers/auth-provider';

/**
 * The daily brief, read through GET /api/daily-briefs. The phone never asks for a brief to be
 * written (that runs a model); it shows what the morning job wrote, and polls while a brief is
 * still being written so the page fills in on its own.
 */

function useUserId(): string | null {
	const { session } = useAuth();
	return session?.user.id ?? null;
}

export function briefQueryKey(userId: string | null, date: string | null) {
	return ['brief', userId, date] as const;
}

/** One day's brief, or null when none was written. Polls every 10 s while it is being written. */
export function useBrief(date: string | null) {
	const userId = useUserId();
	return useQuery({
		queryKey: briefQueryKey(userId, date),
		queryFn: async ({ signal }) =>
			(await api.briefs.forDate({ date: date ?? undefined }, { signal })).brief,
		enabled: Boolean(userId && date),
		staleTime: 60_000,
		refetchInterval: (query) =>
			isWriting(query.state.data?.generation_status) ? 10_000 : false
	});
}

/** The newest finished brief, for Today when today's is missing or failed. */
export function useLatestBrief(enabled: boolean) {
	const userId = useUserId();
	return useQuery({
		queryKey: ['brief-latest', userId],
		queryFn: async ({ signal }) => {
			const { briefs } = await api.briefs.history({ limit: 3 }, { signal });
			return briefs.find((brief) => brief.generation_status === 'completed') ?? null;
		},
		enabled: Boolean(userId) && enabled,
		staleTime: 5 * 60_000
	});
}

export type TodayBriefCard = {
	brief: DailyBrief | DailyBriefListItem;
	/** Today's own brief (even while it is still being written), not an earlier day's. */
	today: boolean;
};

/** What the Today card shows: today's brief, else the last one written; null means no card. */
export function useTodayBrief(today: string): { card: TodayBriefCard | null; loading: boolean } {
	const todays = useBrief(today);
	const needsLast =
		todays.isSuccess && (todays.data === null || todays.data.generation_status === 'failed');
	const last = useLatestBrief(needsLast);

	if (todays.data && todays.data.generation_status !== 'failed') {
		return { card: { brief: todays.data, today: true }, loading: false };
	}
	if (needsLast && last.data && last.data.brief_date !== today) {
		return { card: { brief: last.data, today: false }, loading: false };
	}
	return { card: null, loading: todays.isPending || (needsLast && last.isPending) };
}
