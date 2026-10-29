// apps/mobile/src/app/(tabs)/projects.tsx
import type { ProjectSummary } from '@buildos/api-client';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { AppText } from '@/components/text';
import { useProjects } from '@/hooks/use-entities';
import { useTheme } from '@/providers/theme-provider';
import { radius, spacing } from '@/theme';

const IN_MOTION = new Set(['planning', 'active']);
const STATE_LABEL: Record<string, string> = {
	planning: 'Planning',
	active: 'Active',
	paused: 'Paused',
	completed: 'Completed',
	cancelled: 'Cancelled'
};

function updatedLabel(updatedAt: string): string {
	const date = new Date(updatedAt);
	if (Number.isNaN(date.getTime())) return '';
	return `updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

const byRecent = (a: ProjectSummary, b: ProjectSummary) =>
	Date.parse(b.updated_at) - Date.parse(a.updated_at);

/**
 * Every project, most recently touched first. Your Workspace (where captures land) sits on
 * top; paused and finished projects fold away at the bottom.
 */
export default function ProjectsScreen() {
	const colors = useTheme();
	const projects = useProjects();
	const [showRest, setShowRest] = useState(false);
	const all = projects.data ?? [];
	const workspace = all.find((project) => project.kind === 'workspace');
	const others = all.filter((project) => project.kind !== 'workspace');
	const moving = others.filter((project) => IN_MOTION.has(project.state_key)).sort(byRecent);
	const rest = others.filter((project) => !IN_MOTION.has(project.state_key)).sort(byRecent);

	return (
		<Screen
			refreshControl={
				<RefreshControl
					refreshing={projects.isRefetching}
					onRefresh={() => void projects.refetch()}
					tintColor={colors.accent}
				/>
			}
		>
			{projects.isPending ? <AppText variant="muted">Loading your projects…</AppText> : null}
			{projects.isError ? (
				<View style={{ gap: spacing.sm }}>
					<AppText variant="error">
						{projects.error instanceof Error
							? projects.error.message
							: 'Could not load projects.'}
					</AppText>
					<Button
						title="Try again"
						variant="ghost"
						onPress={() => void projects.refetch()}
					/>
				</View>
			) : null}

			{workspace ? (
				<ProjectRow
					name="Workspace"
					meta={`Your captures and loose tasks · ${workspace.task_count} task${workspace.task_count === 1 ? '' : 's'}`}
					onPress={() => open(workspace)}
				/>
			) : null}

			{moving.length ? (
				<View style={{ gap: spacing.sm }}>
					<AppText variant="label">In motion · {moving.length}</AppText>
					{moving.map((project) => (
						<ProjectRow
							key={project.id}
							name={project.name}
							meta={meta(project)}
							onPress={() => open(project)}
						/>
					))}
				</View>
			) : null}

			{rest.length ? (
				<View style={{ gap: spacing.sm }}>
					<Pressable
						accessibilityRole="button"
						accessibilityState={{ expanded: showRest }}
						onPress={() => setShowRest((open) => !open)}
						hitSlop={8}
					>
						<AppText variant="label">
							{showRest ? '▾' : '▸'} Paused and finished · {rest.length}
						</AppText>
					</Pressable>
					{showRest
						? rest.map((project) => (
								<ProjectRow
									key={project.id}
									name={project.name}
									meta={`${STATE_LABEL[project.state_key] ?? project.state_key} · ${meta(project)}`}
									onPress={() => open(project)}
								/>
							))
						: null}
				</View>
			) : null}

			{!projects.isPending && !projects.isError && all.length === 0 ? (
				<AppText variant="muted">
					No projects yet. Capture a few thoughts on Today and BuildOS will suggest one.
				</AppText>
			) : null}
		</Screen>
	);
}

function meta(project: ProjectSummary): string {
	const tasks = `${project.task_count} task${project.task_count === 1 ? '' : 's'}`;
	return [tasks, updatedLabel(project.updated_at)].filter(Boolean).join(' · ');
}

function open(project: ProjectSummary) {
	router.push({ pathname: '/project/[id]', params: { id: project.id } });
}

function ProjectRow({ name, meta, onPress }: { name: string; meta: string; onPress: () => void }) {
	const colors = useTheme();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${name}, ${meta}`}
			onPress={onPress}
			style={({ pressed }) => ({
				padding: spacing.md,
				gap: 2,
				borderRadius: radius.md,
				borderWidth: 1,
				borderColor: colors.border,
				backgroundColor: pressed ? colors.muted : colors.card
			})}
		>
			<AppText variant="heading" numberOfLines={2}>
				{name}
			</AppText>
			<AppText variant="muted">{meta}</AppText>
		</Pressable>
	);
}
