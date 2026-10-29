// apps/mobile/src/app/index.tsx
import { useQuery } from '@tanstack/react-query';
import type { TodayFeed, TodayTask } from '@buildos/api-client';
import { RefreshControl, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { AppText } from '@/components/text';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';
import { radius, spacing } from '@/theme';

const BUCKET_LABELS: Record<TodayTask['bucket'], string> = {
	due_today: 'Due today',
	starts_today: 'Starts today',
	in_progress: 'In progress'
};

/** Today, read-only: the same feed the web's /today renders, through /api/today. */
export default function TodayScreen() {
	const { session } = useAuth();
	const colors = useTheme();
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	const today = useQuery({
		queryKey: ['today', session?.user.id, timezone],
		queryFn: async () => (await api.today.get({ timezone })).feed,
		enabled: Boolean(session)
	});

	const feed = today.data;

	return (
		<Screen
			refreshControl={
				<RefreshControl
					refreshing={today.isRefetching}
					onRefresh={() => void today.refetch()}
					tintColor={colors.accent}
				/>
			}
		>
			<View style={{ gap: spacing.xs }}>
				<AppText variant="label">{feed ? formatDate(feed.date) : 'Today'}</AppText>
				<AppText variant="title">{headline(feed)}</AppText>
			</View>

			{today.isPending ? <AppText variant="muted">Loading your day…</AppText> : null}

			{today.isError ? (
				<View style={{ gap: spacing.sm }}>
					<AppText variant="error">{describeError(today.error)}</AppText>
					<Button
						title="Try again"
						variant="ghost"
						onPress={() => void today.refetch()}
					/>
				</View>
			) : null}

			{feed ? <FeedBody feed={feed} /> : null}

			<View style={{ marginTop: 'auto', gap: spacing.sm }}>
				<AppText variant="muted" style={{ textAlign: 'center' }}>
					{session?.user.email}
				</AppText>
				<Button
					title="Sign out"
					variant="ghost"
					onPress={() => void supabase.auth.signOut({ scope: 'local' })}
				/>
			</View>
		</Screen>
	);
}

function FeedBody({ feed }: { feed: TodayFeed }) {
	const colors = useTheme();
	const buckets = (Object.keys(BUCKET_LABELS) as TodayTask['bucket'][])
		.map((bucket) => ({ bucket, tasks: feed.tasks.filter((task) => task.bucket === bucket) }))
		.filter((group) => group.tasks.length > 0);

	return (
		<View style={{ gap: spacing.lg }}>
			<View style={{ flexDirection: 'row', gap: spacing.md }}>
				<Stat label="Events" value={feed.events.length} />
				<Stat label="Tasks" value={feed.tasks.length} />
				<Stat
					label="Overdue"
					value={feed.overdueCount}
					tone={feed.overdueCount ? 'warning' : undefined}
				/>
			</View>

			{buckets.map((group) => (
				<View key={group.bucket} style={{ gap: spacing.sm }}>
					<AppText variant="label">{BUCKET_LABELS[group.bucket]}</AppText>
					{group.tasks.map((task) => (
						<View
							key={task.id}
							style={{
								padding: spacing.md,
								gap: 2,
								borderRadius: radius.md,
								borderWidth: 1,
								borderColor: colors.border,
								backgroundColor: colors.card
							}}
						>
							<AppText>{task.title}</AppText>
							<AppText variant="muted">{task.project_name}</AppText>
						</View>
					))}
				</View>
			))}

			{buckets.length === 0 && feed.projects.length > 0 ? (
				<View style={{ gap: spacing.sm }}>
					<AppText variant="label">What's waiting</AppText>
					{feed.projects
						.filter((project) => project.next_step_short)
						.slice(0, 5)
						.map((project) => (
							<View key={project.id} style={{ gap: 2 }}>
								<AppText>{project.next_step_short}</AppText>
								<AppText variant="muted">{project.name}</AppText>
							</View>
						))}
				</View>
			) : null}

			{feed.degradedSections.length > 0 ? (
				<AppText variant="muted">
					Some of today could not load ({feed.degradedSections.join(', ')}). Pull to
					retry.
				</AppText>
			) : null}
		</View>
	);
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warning' }) {
	const colors = useTheme();
	return (
		<View
			style={{
				flex: 1,
				padding: spacing.md,
				borderRadius: radius.md,
				backgroundColor: colors.card,
				borderWidth: 1,
				borderColor: colors.border,
				gap: 2
			}}
		>
			<AppText variant="label">{label}</AppText>
			<AppText
				variant="heading"
				style={{
					fontVariant: ['tabular-nums'],
					color: tone === 'warning' ? colors.warning : colors.foreground
				}}
			>
				{value}
			</AppText>
		</View>
	);
}

function headline(feed: TodayFeed | undefined): string {
	if (!feed) return 'Your day';
	if (feed.tasks.length === 0 && feed.events.length === 0) return 'A clear day';
	const parts: string[] = [];
	if (feed.events.length)
		parts.push(`${feed.events.length} event${feed.events.length === 1 ? '' : 's'}`);
	if (feed.tasks.length)
		parts.push(`${feed.tasks.length} task${feed.tasks.length === 1 ? '' : 's'}`);
	return parts.join(', ');
}

function formatDate(isoDate: string): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	if (!year || !month || !day) return isoDate;
	return new Date(year, month - 1, day).toLocaleDateString(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
}

function describeError(error: unknown): string {
	if (error && typeof error === 'object' && 'isNetworkError' in error && error.isNetworkError) {
		return 'No connection. Your day will load when you are back online.';
	}
	return error instanceof Error ? error.message : 'Could not load today.';
}
