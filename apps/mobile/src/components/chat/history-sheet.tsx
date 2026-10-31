// apps/mobile/src/components/chat/history-sheet.tsx
// Earlier chats in this context, as an iOS page sheet: tap one to pick it up again.
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatSummary } from '@buildos/api-client';

import { BoltSpinner, NavKey, playHaptic, X } from '@/components/kit';
import { useChatSessions } from '@/hooks/use-chat';
import { type ChatTarget, targetLabel } from '@/lib/chat/context';
import { useInk } from '@/providers/theme-provider';
import { spacing, typeScale, withAlpha } from '@/theme';

/** "just now", "5m ago", "3h ago", "2d ago", else a short date. */
export function timeAgo(iso: string | null, now: number = Date.now()): string {
	const at = iso ? Date.parse(iso) : Number.NaN;
	if (!Number.isFinite(at)) return '';
	const minutes = Math.round((now - at) / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function HistorySheet({
	visible,
	target,
	currentSessionId,
	chats: given,
	onClose,
	onOpen
}: {
	visible: boolean;
	target: ChatTarget;
	currentSessionId: string | null;
	/** Dev demo: show these instead of fetching. */
	chats?: ChatSummary[];
	onClose: () => void;
	onOpen: (sessionId: string) => void;
}) {
	const ink = useInk();
	const { colors } = ink;
	const insets = useSafeAreaInsets();
	const sessions = useChatSessions(target, visible && !given);
	const chats = given ?? sessions.data?.chats ?? [];
	const pending = !given && sessions.isPending;
	const failed = !given && sessions.isError;

	const renderItem = ({ item }: { item: ChatSummary }) => {
		const current =
			item.id === currentSessionId || (currentSessionId === 'demo' && item === chats[0]);
		return (
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={item.title}
				accessibilityState={{ selected: current }}
				onPress={() => {
					playHaptic('selection');
					onOpen(item.id);
				}}
				style={({ pressed }) => [
					styles.row,
					{ borderBottomColor: withAlpha(colors.border, 0.7) },
					pressed && { backgroundColor: colors.muted }
				]}
			>
				<View style={[styles.current, current && { backgroundColor: colors.accent }]} />
				<View style={styles.rowText}>
					<Text numberOfLines={1} style={[typeScale.row, { color: colors.foreground }]}>
						{item.title}
					</Text>
					<Text
						numberOfLines={1}
						style={[typeScale.meta, { color: colors.mutedForeground }]}
					>
						{[
							timeAgo(item.last_activity_at),
							item.message_count
								? `${item.message_count} ${item.message_count === 1 ? 'message' : 'messages'}`
								: null,
							item.focus_label
						]
							.filter(Boolean)
							.join(' · ')}
					</Text>
				</View>
			</Pressable>
		);
	};

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
						<Text style={[typeScale.sheetTitle, { color: colors.foreground }]}>
							Chats
						</Text>
						<Text style={[typeScale.meta, { color: colors.mutedForeground }]}>
							{targetLabel(target)}
						</Text>
					</View>
					<NavKey
						icon={X}
						accessibilityLabel="Close"
						onPress={onClose}
						haptic="selection"
					/>
				</View>
				{pending ? (
					<View style={styles.center}>
						<BoltSpinner size={28} label="Loading chats" />
					</View>
				) : failed ? (
					<View style={styles.center}>
						<Text style={[typeScale.row, { color: colors.destructive }]}>
							Couldn't load your chats.
						</Text>
					</View>
				) : (
					<FlatList
						data={chats}
						keyExtractor={(item) => item.id}
						renderItem={renderItem}
						contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
						ListEmptyComponent={
							<View style={styles.center}>
								<Text style={[typeScale.row, { color: colors.mutedForeground }]}>
									No chats here yet.
								</Text>
							</View>
						}
					/>
				)}
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	sheet: { flex: 1 },
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
	headText: { gap: 2 },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingVertical: 12,
		paddingLeft: 12,
		paddingRight: 18,
		borderBottomWidth: 1
	},
	current: { width: 6, height: 6, borderRadius: 3 },
	rowText: { flex: 1, gap: 2 },
	center: { padding: spacing.xl, alignItems: 'center' }
});
