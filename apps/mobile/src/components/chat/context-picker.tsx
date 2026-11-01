// apps/mobile/src/components/chat/context-picker.tsx
// The opening screen when chat is opened from Today or Workspace, as on the website: choose
// Workspace chat or a project first, so the chat always knows what it is about. The project
// list is the same screen, one tap deeper (the web's second view), with search.
import type { ChatSummary, DesktopProject } from '@buildos/api-client';
import { memo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
	BoltMark,
	BoltSpinner,
	ChevronRight,
	Folder,
	MicroLabel,
	playHaptic,
	ProjectTile,
	Search
} from '@/components/kit';
import { pickableProjects, projectAside } from '@/lib/chat/opening';
import { useInk } from '@/providers/theme-provider';
import { radius, spacing, typeScale, withAlpha } from '@/theme';

import { timeAgo } from './history-sheet';

type CardProps = {
	title: string;
	subtitle: string;
	aside?: string | null;
	glyph: 'workspace' | 'project';
	onPress: () => void;
};

function ChoiceCard({ title, subtitle, aside, glyph, onPress }: CardProps) {
	const ink = useInk();
	const { colors } = ink;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${title}. ${subtitle}`}
			onPress={() => {
				playHaptic('selection');
				onPress();
			}}
			style={({ pressed }) => [
				styles.card,
				{
					backgroundColor: pressed ? colors.muted : colors.card,
					borderColor: colors.border,
					boxShadow: ink.shadows.ink
				}
			]}
		>
			<View style={[styles.cardGlyph, { backgroundColor: withAlpha(colors.accent, 0.12) }]}>
				{glyph === 'workspace' ? (
					<BoltMark size={18} />
				) : (
					<Folder size={18} color={colors.accent} strokeWidth={2} />
				)}
			</View>
			<View style={styles.cardText}>
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.section, { color: colors.foreground }]}
				>
					{title}
				</Text>
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.meta, { color: colors.mutedForeground }]}
				>
					{subtitle}
				</Text>
			</View>
			<View style={styles.cardEnd}>
				{aside ? (
					<Text
						maxFontSizeMultiplier={1.3}
						style={[typeScale.small, { color: colors.mutedForeground }]}
					>
						{aside}
					</Text>
				) : null}
				<ChevronRight size={16} color={colors.mutedForeground} />
			</View>
		</Pressable>
	);
}

/** An earlier chat to pick up: title and when. */
export const EarlierChatRow = memo(function EarlierChatRow({
	chat,
	onPress
}: {
	chat: ChatSummary;
	onPress: () => void;
}) {
	const { colors } = useInk();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`Pick up “${chat.title}”`}
			onPress={() => {
				playHaptic('selection');
				onPress();
			}}
			style={({ pressed }) => [
				styles.earlier,
				{ borderBottomColor: withAlpha(colors.border, 0.7) },
				pressed && { backgroundColor: colors.muted }
			]}
		>
			<View style={styles.earlierText}>
				<Text
					numberOfLines={1}
					maxFontSizeMultiplier={1.4}
					style={[typeScale.row, { color: colors.foreground }]}
				>
					{chat.title}
				</Text>
				<Text
					numberOfLines={1}
					maxFontSizeMultiplier={1.4}
					style={[typeScale.small, { color: colors.mutedForeground }]}
				>
					{[timeAgo(chat.last_activity_at), chat.focus_label].filter(Boolean).join(' · ')}
				</Text>
			</View>
			<ChevronRight size={15} color={colors.mutedForeground} />
		</Pressable>
	);
});

export function EarlierChats({
	chats,
	loading,
	limit = 3,
	heading = 'Pick up where you left off',
	onOpen
}: {
	chats: ChatSummary[] | undefined;
	loading: boolean;
	limit?: number;
	heading?: string;
	onOpen: (sessionId: string) => void;
}) {
	const shown = (chats ?? []).slice(0, limit);
	if (!loading && shown.length === 0) return null;
	return (
		<View style={styles.earlierBlock}>
			<MicroLabel style={styles.earlierHead}>{heading}</MicroLabel>
			{loading && shown.length === 0 ? (
				<BoltSpinner
					size={18}
					label="Loading earlier chats"
					style={styles.earlierSpinner}
				/>
			) : (
				shown.map((chat) => (
					<EarlierChatRow key={chat.id} chat={chat} onPress={() => onOpen(chat.id)} />
				))
			)}
		</View>
	);
}

export type ContextPickerProps = {
	stage: 'pick' | 'projects';
	projects: DesktopProject[] | undefined;
	projectsLoading: boolean;
	earlierChats: ChatSummary[] | undefined;
	earlierLoading: boolean;
	query: string;
	onQuery: (value: string) => void;
	onWorkspace: () => void;
	onProjects: () => void;
	onProject: (project: DesktopProject) => void;
	onOpenChat: (sessionId: string) => void;
};

export function ContextPicker({
	stage,
	projects,
	projectsLoading,
	earlierChats,
	earlierLoading,
	query,
	onQuery,
	onWorkspace,
	onProjects,
	onProject,
	onOpenChat
}: ContextPickerProps) {
	const ink = useInk();
	const { colors } = ink;
	const list = pickableProjects(projects, query);
	const all = pickableProjects(projects);

	if (stage === 'projects') {
		return (
			<View style={styles.fill}>
				<View style={styles.searchWrap}>
					<View
						style={[
							styles.search,
							{
								backgroundColor: colors.card,
								borderColor: colors.border,
								boxShadow: ink.shadows.ink
							}
						]}
					>
						<Search size={16} color={colors.mutedForeground} strokeWidth={2} />
						<TextInput
							value={query}
							onChangeText={onQuery}
							placeholder="Search projects"
							placeholderTextColor={colors.mutedForeground}
							accessibilityLabel="Search projects"
							autoCorrect={false}
							returnKeyType="search"
							clearButtonMode="while-editing"
							maxFontSizeMultiplier={1.4}
							style={[
								typeScale.row,
								styles.searchInput,
								{ color: colors.foreground }
							]}
						/>
					</View>
				</View>
				{projectsLoading && list.length === 0 ? (
					<View style={styles.center}>
						<BoltSpinner size={26} label="Loading your projects" />
					</View>
				) : (
					<FlatList
						data={list}
						keyExtractor={(project) => project.id}
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						contentContainerStyle={styles.projectList}
						renderItem={({ item }) => {
							const aside = projectAside(item);
							return (
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={`Chat about ${item.name}`}
									onPress={() => {
										playHaptic('selection');
										onProject(item);
									}}
									style={({ pressed }) => [
										styles.projectRow,
										{ borderBottomColor: withAlpha(colors.border, 0.7) },
										pressed && { backgroundColor: colors.muted }
									]}
								>
									<ProjectTile project={item} size={40} />
									<View style={styles.projectText}>
										<Text
											numberOfLines={1}
											maxFontSizeMultiplier={1.4}
											style={[typeScale.row, { color: colors.foreground }]}
										>
											{item.name}
										</Text>
										{aside ? (
											<Text
												numberOfLines={1}
												maxFontSizeMultiplier={1.4}
												style={[
													typeScale.small,
													{ color: colors.mutedForeground }
												]}
											>
												{aside}
											</Text>
										) : null}
									</View>
									<ChevronRight size={15} color={colors.mutedForeground} />
								</Pressable>
							);
						}}
						ListEmptyComponent={
							<View style={styles.center}>
								<Text
									maxFontSizeMultiplier={1.4}
									style={[typeScale.row, { color: colors.mutedForeground }]}
								>
									{all.length === 0
										? 'No projects yet. Start one from a capture or on the web.'
										: 'No project matches.'}
								</Text>
							</View>
						}
					/>
				)}
			</View>
		);
	}

	return (
		<View style={styles.fill}>
			<View style={styles.intro}>
				<MicroLabel>Chat about</MicroLabel>
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.title, { color: colors.foreground }]}
				>
					Where do you want to start?
				</Text>
			</View>
			<ChoiceCard
				title="Workspace chat"
				subtitle="Your projects, loose notes and what's coming up."
				glyph="workspace"
				onPress={onWorkspace}
			/>
			<ChoiceCard
				title="Project chat"
				subtitle="Answer questions, explore insights, or update one project."
				aside={all.length ? `${all.length}` : null}
				glyph="project"
				onPress={onProjects}
			/>
			<EarlierChats
				chats={earlierChats}
				loading={earlierLoading}
				heading="Recent Workspace chats"
				onOpen={onOpenChat}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	fill: { flex: 1 },
	intro: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10, gap: 4 },
	card: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		marginHorizontal: 14,
		marginTop: 10,
		paddingHorizontal: 14,
		paddingVertical: 13,
		borderRadius: radius.md,
		borderWidth: 1
	},
	cardGlyph: {
		width: 40,
		height: 40,
		borderRadius: 11,
		alignItems: 'center',
		justifyContent: 'center'
	},
	cardText: { flex: 1, gap: 2 },
	cardEnd: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	earlierBlock: { marginTop: spacing.xl, paddingHorizontal: 14 },
	earlierHead: { paddingHorizontal: 4, marginBottom: 4 },
	earlierSpinner: { marginTop: 10, alignSelf: 'flex-start', marginLeft: 4 },
	earlier: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingVertical: 11,
		paddingHorizontal: 4,
		borderBottomWidth: 1
	},
	earlierText: { flex: 1, gap: 2 },
	searchWrap: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
	search: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingHorizontal: 12,
		height: 44,
		borderRadius: radius.md,
		borderWidth: 1
	},
	searchInput: { flex: 1, paddingVertical: 0 },
	projectList: { paddingHorizontal: 14, paddingBottom: 24 },
	projectRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingVertical: 10,
		borderBottomWidth: 1
	},
	projectText: { flex: 1, gap: 2 },
	center: { padding: spacing.xl, alignItems: 'center' }
});
