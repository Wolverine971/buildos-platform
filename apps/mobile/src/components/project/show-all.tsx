// apps/mobile/src/components/project/show-all.tsx
import type { ProjectFullResponse, ProjectTaskBucket } from '@buildos/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BoltSpinner, ChevronDown, playHaptic } from '@/components/kit';
import { api } from '@/lib/api';
import { fetchWholeBucket } from '@/lib/task-buckets';
import { useAuth } from '@/providers/auth-provider';
import { useInk } from '@/providers/theme-provider';
import { withAlpha } from '@/theme';

import { GLYPH_SIZE } from './rows';

/**
 * The first project read returns up to a page per group. This loads the whole group and folds
 * it into the cached project, so the reader's edits keep reaching every row.
 */
export function ShowAll({
	projectId,
	bucket,
	total
}: {
	projectId: string;
	bucket: ProjectTaskBucket;
	total: number;
}) {
	const { colors } = useInk();
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
		<View>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={busy ? 'Loading the rest' : `Show all ${total}`}
				accessibilityState={{ busy, disabled: busy }}
				disabled={busy}
				onPress={() => {
					playHaptic('light');
					void load();
				}}
				style={({ pressed }) => [
					styles.row,
					{ backgroundColor: pressed ? withAlpha(colors.muted, 0.85) : 'transparent' }
				]}
			>
				<View style={[styles.glyph, { backgroundColor: withAlpha(colors.accent, 0.1) }]}>
					{busy ? (
						<BoltSpinner size={16} label="Loading the rest" />
					) : (
						<ChevronDown size={15} strokeWidth={2.2} color={colors.accent} />
					)}
				</View>
				<Text maxFontSizeMultiplier={1.4} style={[styles.label, { color: colors.accent }]}>
					{busy ? 'Loading…' : `Show all ${total}`}
				</Text>
			</Pressable>
			{error ? (
				<Text
					selectable
					maxFontSizeMultiplier={1.4}
					style={[styles.error, { color: colors.destructive }]}
				>
					{error}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		minHeight: 44,
		paddingVertical: 4,
		paddingHorizontal: 6,
		marginHorizontal: -6,
		borderRadius: 9,
		borderCurve: 'continuous'
	},
	glyph: {
		width: GLYPH_SIZE,
		height: GLYPH_SIZE,
		borderRadius: 8,
		borderCurve: 'continuous',
		alignItems: 'center',
		justifyContent: 'center'
	},
	label: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
	error: { fontSize: 13, lineHeight: 18, marginTop: 2, marginLeft: GLYPH_SIZE + 10 }
});
