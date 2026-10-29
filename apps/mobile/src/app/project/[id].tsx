// apps/mobile/src/app/project/[id].tsx
import type { ProjectFullResponse, ProjectTaskBucket } from '@buildos/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TaskRow } from '@/components/task-row';
import { AppText } from '@/components/text';
import { useProject } from '@/hooks/use-entities';
import { api } from '@/lib/api';
import { orderDocs } from '@/lib/doc-order';
import { describeDue } from '@/lib/due-date';
import { type ReaderItem, setReaderWalk } from '@/lib/reader-walk';
import { fetchWholeBucket, groupTasks } from '@/lib/task-buckets';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';
import { radius, spacing } from '@/theme';

type Tab = 'tasks' | 'docs';

function shortLabel(name: string): string {
	return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

function editedLabel(updatedAt: string): string {
	const date = new Date(updatedAt);
	if (Number.isNaN(date.getTime())) return '';
	return `Edited ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/**
 * A project: its tasks grouped the way the website's board groups them (overdue first, done
 * folded away), and its docs in the website's tree order. Anything opens in the reader, and
 * Prev/Next walk the list you opened it from.
 */
export default function ProjectScreen() {
	const colors = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const projectId = typeof id === 'string' ? id : undefined;
	const query = useProject(projectId);
	const data = query.data;
	const [tab, setTab] = useState<Tab>('tasks');
	const [showDone, setShowDone] = useState(false);

	const name =
		data?.project.kind === 'workspace' ? 'Workspace' : (data?.project.name ?? 'Project');

	const groups = useMemo(() => {
		if (!data) return [];
		const asOf = data.tasks_coverage?.as_of ? new Date(data.tasks_coverage.as_of) : new Date();
		return groupTasks(data.tasks, Number.isNaN(asOf.getTime()) ? new Date() : asOf);
	}, [data]);

	const docs = useMemo(() => {
		if (!data) return [];
		const contextId = data.context_document?.id;
		const ordered = orderDocs(
			data.documents.filter((doc) => doc.id !== contextId),
			data.project.doc_structure
		);
		return data.context_document
			? [{ doc: data.context_document, depth: 0 }, ...ordered]
			: ordered;
	}, [data]);

	const visibleGroups = groups.filter((group) => group.bucket !== 'done' || showDone);
	const openItem = (items: ReaderItem[], item: ReaderItem) => {
		setReaderWalk({ label: shortLabel(name), items });
		router.push({ pathname: '/reader', params: { kind: item.kind, id: item.id } });
	};
	const taskItems = (): ReaderItem[] =>
		visibleGroups.flatMap((group) =>
			group.tasks.map((task) => ({ kind: 'task' as const, id: task.id }))
		);
	const docItems = (): ReaderItem[] =>
		docs.map((entry) => ({ kind: 'document' as const, id: entry.doc.id }));

	const taskCount = data?.tasks_coverage?.total ?? data?.tasks.length ?? 0;
	const now = new Date();

	return (
		<>
			<Stack.Screen options={{ title: name }} />
			<Screen
				refreshControl={
					<RefreshControl
						refreshing={query.isRefetching}
						onRefresh={() => void query.refetch()}
						tintColor={colors.accent}
					/>
				}
			>
				{query.isPending ? (
					<ActivityIndicator
						color={colors.accent}
						accessibilityLabel="Loading the project"
					/>
				) : null}
				{query.isError ? (
					<View style={{ gap: spacing.sm }}>
						<AppText variant="error">
							{query.error instanceof Error
								? query.error.message
								: 'Could not load this project.'}
						</AppText>
						<Button
							title="Try again"
							variant="ghost"
							onPress={() => void query.refetch()}
						/>
					</View>
				) : null}

				{data ? (
					<>
						{data.project.next_step_short ? (
							<View
								style={{
									gap: 2,
									padding: spacing.md,
									borderRadius: radius.md,
									borderWidth: 1,
									borderColor: colors.accent,
									backgroundColor: colors.card
								}}
							>
								<AppText variant="label">Next step</AppText>
								<AppText>{data.project.next_step_short}</AppText>
							</View>
						) : data.project.description ? (
							<AppText variant="muted" numberOfLines={3}>
								{data.project.description}
							</AppText>
						) : null}

						<Segmented
							value={tab}
							onChange={setTab}
							options={[
								{ value: 'tasks', label: `Tasks · ${taskCount}` },
								{ value: 'docs', label: `Docs · ${docs.length}` }
							]}
						/>

						{tab === 'tasks' ? (
							<View style={{ gap: spacing.lg }}>
								{groups.length === 0 ? (
									<AppText variant="muted">No tasks yet.</AppText>
								) : null}
								{groups.map((group) => {
									const coverage = data.tasks_coverage?.buckets?.[group.bucket];
									const total = coverage?.total ?? group.tasks.length;
									const folded = group.bucket === 'done' && !showDone;
									return (
										<View key={group.bucket} style={{ gap: spacing.sm }}>
											{group.bucket === 'done' ? (
												<Pressable
													accessibilityRole="button"
													accessibilityState={{ expanded: showDone }}
													hitSlop={8}
													onPress={() => setShowDone((open) => !open)}
												>
													<AppText variant="label">
														{showDone ? '▾' : '▸'} {group.label} ·{' '}
														{total}
													</AppText>
												</Pressable>
											) : (
												<AppText variant="label">
													{group.label} · {total}
												</AppText>
											)}
											{folded
												? null
												: group.tasks.map((task) => (
														<TaskRow
															key={task.id}
															title={task.title}
															done={task.state_key === 'done'}
															meta={describeDue(task.due_at, now)}
															onPress={() =>
																openItem(taskItems(), {
																	kind: 'task',
																	id: task.id
																})
															}
														/>
													))}
											{!folded &&
											coverage &&
											!coverage.complete &&
											projectId ? (
												<ShowAll
													projectId={projectId}
													bucket={group.bucket}
													total={total}
												/>
											) : null}
										</View>
									);
								})}
							</View>
						) : (
							<View style={{ gap: spacing.sm }}>
								{docs.length === 0 ? (
									<AppText variant="muted">No docs yet.</AppText>
								) : null}
								{docs.map(({ doc, depth }, index) => (
									<Pressable
										key={doc.id}
										accessibilityRole="button"
										onPress={() =>
											openItem(docItems(), { kind: 'document', id: doc.id })
										}
										style={({ pressed }) => ({
											marginLeft: Math.min(depth, 4) * spacing.lg,
											padding: spacing.md,
											gap: 2,
											borderRadius: radius.md,
											borderWidth: 1,
											borderColor:
												index === 0 && data.context_document
													? colors.accent
													: colors.border,
											backgroundColor: pressed ? colors.muted : colors.card
										})}
									>
										<AppText numberOfLines={2}>
											{doc.title?.trim() || 'Untitled'}
										</AppText>
										<AppText variant="muted">
											{index === 0 && data.context_document
												? 'Start here · '
												: ''}
											{editedLabel(doc.updated_at)}
										</AppText>
									</Pressable>
								))}
							</View>
						)}
					</>
				) : null}
			</Screen>
		</>
	);
}

function Segmented<T extends string>({
	value,
	onChange,
	options
}: {
	value: T;
	onChange: (value: T) => void;
	options: Array<{ value: T; label: string }>;
}) {
	const colors = useTheme();
	return (
		<View
			accessibilityRole="tablist"
			style={{
				flexDirection: 'row',
				padding: 3,
				borderRadius: radius.md,
				backgroundColor: colors.muted
			}}
		>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<Pressable
						key={option.value}
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						onPress={() => onChange(option.value)}
						style={{
							flex: 1,
							minHeight: 36,
							alignItems: 'center',
							justifyContent: 'center',
							borderRadius: radius.sm,
							backgroundColor: selected ? colors.background : 'transparent'
						}}
					>
						<AppText
							style={{
								fontWeight: '600',
								color: selected ? colors.foreground : colors.mutedForeground
							}}
						>
							{option.label}
						</AppText>
					</Pressable>
				);
			})}
		</View>
	);
}

/**
 * The first project read returns up to a page per group. This loads the whole group and folds
 * it into the cached project, so the reader's edits keep reaching every row.
 */
function ShowAll({
	projectId,
	bucket,
	total
}: {
	projectId: string;
	bucket: ProjectTaskBucket;
	total: number;
}) {
	const colors = useTheme();
	const queryClient = useQueryClient();
	const { session } = useAuth();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = async () => {
		setBusy(true);
		setError(null);
		try {
			const key = ['project', session?.user.id ?? null, projectId];
			const current = queryClient.getQueryData<ProjectFullResponse>(key);
			const asOf = current?.tasks_coverage?.as_of;
			const whole = await fetchWholeBucket(async (offset) => {
				const page = await api.projects.tasks(projectId, {
					bucket,
					limit: 100,
					offset,
					asOf
				});
				return page;
			});
			queryClient.setQueryData<ProjectFullResponse>(key, (project) => {
				if (!project) return project;
				const known = new Set(project.tasks.map((task) => task.id));
				const coverage = project.tasks_coverage;
				return {
					...project,
					tasks: [...project.tasks, ...whole.tasks.filter((task) => !known.has(task.id))],
					tasks_coverage: coverage
						? {
								...coverage,
								buckets: {
									...coverage.buckets,
									[bucket]: {
										returned: whole.tasks.length,
										total: whole.total,
										complete: whole.complete
									}
								}
							}
						: coverage
				};
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Could not load the rest.');
		} finally {
			setBusy(false);
		}
	};

	return (
		<View style={{ gap: spacing.xs }}>
			<Pressable
				accessibilityRole="button"
				disabled={busy}
				onPress={() => void load()}
				hitSlop={8}
			>
				{busy ? (
					<ActivityIndicator color={colors.accent} />
				) : (
					<AppText style={{ color: colors.accent, fontWeight: '600' }}>
						Show all {total}
					</AppText>
				)}
			</Pressable>
			{error ? <AppText variant="error">{error}</AppText> : null}
		</View>
	);
}
