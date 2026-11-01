// apps/mobile/src/components/chat/focus-sheet.tsx
// Change what a project chat works from, mid-chat, as the website's ProjectFocusSelector does:
// project-wide, or one task, doc, goal, plan, milestone or risk. Same session; the next
// message carries the new focus.
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BoltSpinner, Check, MicroLabel, NavKey, playHaptic, Search, X } from '@/components/kit';
import { useProject } from '@/hooks/use-entities';
import type { ChatFocus } from '@/lib/chat/context';
import { focusSections } from '@/lib/chat/opening';
import { useInk } from '@/providers/theme-provider';
import { radius, spacing, typeScale, withAlpha } from '@/theme';

export function FocusSheet({
	visible,
	projectId,
	projectName,
	current,
	onSelect,
	onSomethingElse,
	onClose
}: {
	visible: boolean;
	projectId: string;
	projectName: string;
	current: ChatFocus | undefined;
	/** null = project-wide. */
	onSelect: (focus: ChatFocus | null) => void;
	/** Leave this chat for a new one about something else (the picker). */
	onSomethingElse: () => void;
	onClose: () => void;
}) {
	const ink = useInk();
	const { colors } = ink;
	const insets = useSafeAreaInsets();
	const project = useProject(visible ? projectId : undefined);
	const [query, setQuery] = useState('');
	const sections = useMemo(() => focusSections(project.data, query), [project.data, query]);
	const pick = (focus: ChatFocus | null) => {
		playHaptic('selection');
		onSelect(focus);
	};
	const rowStyle = (pressed: boolean) => [
		styles.row,
		{ borderBottomColor: withAlpha(colors.border, 0.7) },
		pressed && { backgroundColor: colors.muted }
	];

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<View style={[styles.sheet, { backgroundColor: colors.background }]}>
				<View style={[styles.head, { borderBottomColor: withAlpha(colors.border, 0.7) }]}>
					<View style={styles.headText}>
						<Text
							maxFontSizeMultiplier={1.4}
							style={[typeScale.sheetTitle, { color: colors.foreground }]}
						>
							Work from
						</Text>
						<Text
							numberOfLines={1}
							maxFontSizeMultiplier={1.4}
							style={[typeScale.meta, { color: colors.mutedForeground }]}
						>
							{projectName}
						</Text>
					</View>
					<NavKey
						icon={X}
						accessibilityLabel="Close"
						haptic="selection"
						onPress={onClose}
					/>
				</View>
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
							onChangeText={setQuery}
							placeholder="Search tasks, docs, goals…"
							placeholderTextColor={colors.mutedForeground}
							accessibilityLabel="Search this project"
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
				<ScrollView
					style={styles.list}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					contentContainerStyle={styles.listContent}
				>
					<Pressable
						accessibilityRole="button"
						accessibilityState={{ selected: !current }}
						accessibilityLabel="Project-wide"
						onPress={() => pick(null)}
						style={({ pressed }) => rowStyle(pressed)}
					>
						<View style={styles.rowText}>
							<Text
								maxFontSizeMultiplier={1.4}
								style={[typeScale.row, { color: colors.foreground }]}
							>
								Project-wide
							</Text>
							<Text
								maxFontSizeMultiplier={1.4}
								style={[typeScale.small, { color: colors.mutedForeground }]}
							>
								Everything in {projectName}. Recommended.
							</Text>
						</View>
						{!current ? (
							<Check size={16} color={colors.accent} strokeWidth={2.4} />
						) : null}
					</Pressable>
					{project.isPending ? (
						<View style={styles.center}>
							<BoltSpinner size={24} label="Loading this project" />
						</View>
					) : project.isError ? (
						<View style={styles.center}>
							<Text
								maxFontSizeMultiplier={1.4}
								style={[typeScale.row, { color: colors.destructive }]}
							>
								Couldn't load this project.
							</Text>
						</View>
					) : sections.length === 0 ? (
						<View style={styles.center}>
							<Text
								maxFontSizeMultiplier={1.4}
								style={[typeScale.row, { color: colors.mutedForeground }]}
							>
								{query.trim() ? 'Nothing matches.' : 'Nothing to focus on yet.'}
							</Text>
						</View>
					) : (
						sections.map((section) => (
							<View key={section.kind}>
								<MicroLabel style={styles.sectionHead}>{section.label}</MicroLabel>
								{section.items.map((item) => {
									const selected =
										current?.kind === item.kind && current.id === item.id;
									return (
										<Pressable
											key={`${item.kind}:${item.id}`}
											accessibilityRole="button"
											accessibilityState={{ selected }}
											accessibilityLabel={`${section.label.slice(0, -1)} ${item.name}`}
											onPress={() =>
												pick({
													kind: item.kind,
													id: item.id,
													name: item.name
												})
											}
											style={({ pressed }) => rowStyle(pressed)}
										>
											<View style={styles.rowText}>
												<Text
													numberOfLines={2}
													maxFontSizeMultiplier={1.4}
													style={[
														typeScale.row,
														{ color: colors.foreground }
													]}
												>
													{item.name.trim() || 'Untitled'}
												</Text>
												{item.meta ? (
													<Text
														maxFontSizeMultiplier={1.4}
														style={[
															typeScale.small,
															{ color: colors.mutedForeground }
														]}
													>
														{item.meta}
													</Text>
												) : null}
											</View>
											{selected ? (
												<Check
													size={16}
													color={colors.accent}
													strokeWidth={2.4}
												/>
											) : null}
										</Pressable>
									);
								})}
							</View>
						))
					)}
				</ScrollView>
				<View
					style={[
						styles.footer,
						{
							borderTopColor: withAlpha(colors.border, 0.7),
							paddingBottom: insets.bottom + spacing.md
						}
					]}
				>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Chat about something else"
						accessibilityHint="Starts a new chat and asks what it is about"
						onPress={() => {
							playHaptic('selection');
							onSomethingElse();
						}}
						style={({ pressed }) => [styles.elsewhere, pressed && { opacity: 0.6 }]}
					>
						<Text
							maxFontSizeMultiplier={1.4}
							style={[typeScale.row, { color: colors.accent }]}
						>
							Chat about something else
						</Text>
						<Text
							maxFontSizeMultiplier={1.4}
							style={[typeScale.small, { color: colors.mutedForeground }]}
						>
							Starts a new chat. This one stays under Earlier chats.
						</Text>
					</Pressable>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	sheet: { flex: 1 },
	list: { flex: 1 },
	head: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingLeft: 18,
		paddingRight: 12,
		paddingTop: 14,
		paddingBottom: 12,
		borderBottomWidth: 1
	},
	headText: { gap: 2, flex: 1 },
	searchWrap: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
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
	sectionHead: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 4 },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingVertical: 11,
		paddingHorizontal: 18,
		borderBottomWidth: 1
	},
	rowText: { flex: 1, gap: 2 },
	center: { padding: spacing.xl, alignItems: 'center' },
	listContent: { paddingBottom: spacing.lg },
	footer: { borderTopWidth: 1, paddingTop: spacing.md },
	elsewhere: { paddingHorizontal: 18, gap: 2 }
});
