// apps/mobile/src/app/chat.tsx
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	FlatList,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	StyleSheet,
	Text,
	View
} from 'react-native';

import { Composer } from '@/components/chat/composer';
import { HistorySheet } from '@/components/chat/history-sheet';
import { AssistantText, UserBubble, WorkBlock } from '@/components/chat/rows';
import {
	BoltMark,
	BoltSpinner,
	ChevronDown,
	Clock,
	NavBar,
	NavKey,
	RoundKey,
	Sheet,
	SquarePen
} from '@/components/kit';
import { useChat } from '@/hooks/use-chat';
import { parseTargetParams, targetLabel } from '@/lib/chat/context';
import { demoChats, parseDemoParam } from '@/lib/chat/demo';
import { FOLLOW_THRESHOLD, showJumpToLatest } from '@/lib/chat/list-follow';
import type { ChatRow } from '@/lib/chat/session-store';
import { useInk } from '@/providers/theme-provider';
import { spacing, typeScale, withAlpha } from '@/theme';

const DEV = typeof __DEV__ !== 'undefined' && __DEV__;

function renderRow({ item }: { item: ChatRow }) {
	switch (item.kind) {
		case 'user':
			return <UserBubble row={item} />;
		case 'work':
			return <WorkBlock row={item} />;
		case 'assistant':
			return <AssistantText row={item} />;
	}
}

const keyOf = (row: ChatRow) => row.id;

/**
 * Chat with BuildOS, full screen over whatever was open, the way the website's phone view
 * does it. The Brain Bolt in a page's nav bar opens it about that page: the Workspace, or one
 * project. Replies stream in over the realtime channel and keep arriving after this closes.
 *
 * Layout: the list is inverted (offset 0 = the newest row), so when the keyboard lifts the
 * composer and the list shrinks, the newest messages stay in view with no scroll math; new
 * text grows at the bottom edge while the person is there and leaves them alone if they have
 * scrolled back (a jump key brings them down). Dev: `?demo=history|streaming|done|live` and
 * `?autofocus=1` show every state without sending a turn (lib/chat/demo.ts).
 */
export default function ChatScreen() {
	const params = useLocalSearchParams<{
		context?: string;
		projectId?: string;
		projectName?: string;
		sessionId?: string;
		from?: string;
		demo?: string;
		autofocus?: string;
		history?: string;
	}>();
	const target = useMemo(
		() => parseTargetParams(params),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[params.context, params.projectId, params.projectName]
	);
	const demo = DEV ? parseDemoParam(params.demo) : null;
	// Any value focuses; a new value re-focuses, so screenshots can reopen the keyboard.
	const autoFocus = DEV && typeof params.autofocus === 'string' ? params.autofocus : null;
	const chat = useChat(target, typeof params.sessionId === 'string' ? params.sessionId : null, {
		demo
	});
	const { colors } = useInk();
	const [history, setHistory] = useState(false);
	useEffect(() => {
		if (DEV && typeof params.history === 'string') setHistory(params.history === '1');
	}, [params.history]);
	const [jump, setJump] = useState(false);
	const listRef = useRef<FlatList<ChatRow>>(null);
	const label = targetLabel(target);
	const from = typeof params.from === 'string' && params.from ? params.from : label;
	const streaming = chat.activeTurn !== null;
	const newestFirst = useMemo(() => [...chat.rows].reverse(), [chat.rows]);
	const demoHistory = useMemo(() => (demo ? demoChats(Date.now()) : undefined), [demo]);

	const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
		const next = showJumpToLatest(event.nativeEvent.contentOffset.y);
		setJump((current) => (current === next ? current : next));
	}, []);
	const jumpToLatest = () => listRef.current?.scrollToOffset({ offset: 0, animated: true });

	return (
		<View style={[styles.root, { backgroundColor: colors.bench }]}>
			<Stack.Screen options={{ title: `Chat · ${label}` }} />
			<NavBar
				back={{ label: from, onPress: () => router.back() }}
				right={
					<>
						<NavKey
							icon={Clock}
							accessibilityLabel="Earlier chats"
							accessibilityHint={`Chats about ${label}`}
							onPress={() => setHistory(true)}
						/>
						<NavKey
							icon={SquarePen}
							accessibilityLabel="New chat"
							disabled={!chat.sessionId}
							onPress={chat.startNew}
						/>
					</>
				}
			/>
			<Sheet style={styles.sheet}>
				<View
					style={[styles.context, { borderBottomColor: withAlpha(colors.border, 0.7) }]}
					accessible
					accessibilityRole="header"
					accessibilityLabel={`Chatting about ${label}`}
				>
					<BoltMark size={13} />
					<Text
						numberOfLines={1}
						maxFontSizeMultiplier={1.4}
						style={[
							typeScale.section,
							styles.contextText,
							{ color: colors.foreground }
						]}
					>
						{label}
					</Text>
				</View>
				<View style={styles.body}>
					{chat.loading && chat.rows.length === 0 ? (
						<View style={styles.center}>
							<BoltSpinner size={28} label="Opening this chat" />
						</View>
					) : chat.rows.length === 0 ? (
						<View style={styles.empty}>
							<BoltMark size={22} />
							<Text
								maxFontSizeMultiplier={1.4}
								style={[typeScale.title, { color: colors.foreground }]}
							>
								{target.type === 'project' ? `Ask about ${label}` : 'Ask BuildOS'}
							</Text>
							<Text
								maxFontSizeMultiplier={1.5}
								style={[typeScale.body, { color: colors.mutedForeground }]}
							>
								{target.type === 'project'
									? 'Its tasks, its docs, what to do next. I can change things too; you see every step.'
									: "Today's plan, a note you captured, what to do next across your Workspace. I can change things too; you see every step."}
							</Text>
						</View>
					) : (
						<FlatList
							ref={listRef}
							inverted
							data={newestFirst}
							keyExtractor={keyOf}
							renderItem={renderRow}
							contentContainerStyle={styles.list}
							maintainVisibleContentPosition={{
								minIndexForVisible: 0,
								autoscrollToTopThreshold: FOLLOW_THRESHOLD
							}}
							onScroll={onScroll}
							scrollEventThrottle={100}
							keyboardDismissMode="interactive"
							keyboardShouldPersistTaps="handled"
							automaticallyAdjustKeyboardInsets={false}
							contentInsetAdjustmentBehavior="never"
							initialNumToRender={12}
							windowSize={7}
							// Text selection needs the row to stay mounted.
							removeClippedSubviews={false}
							extraData={streaming}
						/>
					)}
					{jump && chat.rows.length > 0 ? (
						<RoundKey
							icon={ChevronDown}
							tone="outline"
							size={36}
							iconSize={18}
							haptic="selection"
							accessibilityLabel="Jump to the latest"
							onPress={jumpToLatest}
							style={styles.jump}
						/>
					) : null}
				</View>
				<Composer
					busy={streaming}
					onSend={chat.send}
					onStop={() => void chat.stop()}
					error={chat.error}
					onDismissError={chat.clearError}
					placeholder={target.type === 'project' ? `Ask about ${label}` : 'Ask BuildOS'}
					autoFocus={autoFocus}
				/>
			</Sheet>
			<HistorySheet
				visible={history}
				target={target}
				currentSessionId={chat.sessionId}
				chats={demoHistory}
				onClose={() => setHistory(false)}
				onOpen={(id) => {
					setHistory(false);
					chat.open(id);
				}}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	sheet: { flex: 1 },
	context: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 7,
		paddingHorizontal: 14,
		paddingVertical: 9,
		borderBottomWidth: 1
	},
	contextText: { flexShrink: 1 },
	body: { flex: 1 },
	// Inverted: paddingTop is the gap above the composer, paddingBottom the gap under the header.
	list: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, gap: 16 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	empty: { flex: 1, justifyContent: 'flex-end', padding: 18, paddingBottom: 22, gap: spacing.sm },
	jump: { position: 'absolute', right: 14, bottom: 10 }
});
