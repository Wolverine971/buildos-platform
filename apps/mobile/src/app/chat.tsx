// apps/mobile/src/app/chat.tsx
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	FlatList,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Pressable,
	StyleSheet,
	Text,
	View
} from 'react-native';

import { ChangesBlock } from '@/components/chat/changes-row';
import { ChatActionsContext } from '@/components/chat/chat-actions';
import { Composer } from '@/components/chat/composer';
import { ContextPicker, EarlierChats } from '@/components/chat/context-picker';
import { FocusSheet } from '@/components/chat/focus-sheet';
import { HistorySheet } from '@/components/chat/history-sheet';
import { PendingChangeStrip } from '@/components/chat/pending-change-strip';
import { ProposalCardRow } from '@/components/chat/proposal-card';
import { AssistantText, UserBubble, WorkBlock } from '@/components/chat/rows';
import {
	BoltMark,
	BoltSpinner,
	ChevronDown,
	ChevronRight,
	Clock,
	MicroLabel,
	NavBar,
	NavKey,
	playHaptic,
	RoundKey,
	Sheet,
	SquarePen
} from '@/components/kit';
import { useChat, useChatSessions } from '@/hooks/use-chat';
import { useDesktop } from '@/hooks/use-desktop';
import { api } from '@/lib/api';
import { type CreatedEntity, entityWebPath } from '@/lib/chat/changes';
import {
	type ChatFocus,
	type ChatTarget,
	describeTarget,
	focusLabel,
	GLOBAL_TARGET,
	parseTargetParams,
	targetLabel
} from '@/lib/chat/context';
import { demoChats, demoHasSession, parseDemoParam } from '@/lib/chat/demo';
import { FOLLOW_THRESHOLD, showJumpToLatest } from '@/lib/chat/list-follow';
import { type ChatStage, initialStage } from '@/lib/chat/opening';
import type { ChatRow } from '@/lib/chat/session-store';
import { setReaderWalk } from '@/lib/reader-walk';
import { OPEN_PROJECT_PARAM } from '@/lib/routes';
import { openWebPage } from '@/lib/web-pages';
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
		case 'card':
			return <ProposalCardRow row={item} />;
		case 'changes':
			return <ChangesBlock row={item} />;
	}
}

const keyOf = (row: ChatRow) => row.id;

/**
 * Chat with BuildOS, full screen over whatever was open, the way the website's phone view
 * does it. It always knows what it is about, as the website's chat does: opened from Today or
 * the Workspace it first asks (Workspace chat, or one project: the web's context picker);
 * opened from a project page that project is already chosen; opened from the reader the task
 * or doc is the focus. The strip under the nav bar always says what the chat is about, and is
 * how you change it: before the first message it goes back to the picker (a new draft, as the
 * web's back button does); in a project chat with messages it opens the focus sheet, which
 * narrows the same session to one item, as the web's focus selector does.
 *
 * Layout: the list is inverted (offset 0 = the newest row), so when the keyboard lifts the
 * composer and the list shrinks, the newest messages stay in view with no scroll math; new
 * text grows at the bottom edge while the person is there and leaves them alone if they have
 * scrolled back (a jump key brings them down). Dev: `?demo=pick|projects|history|streaming|
 * done|live|card|focus` and `?autofocus=1` show every state without sending a turn
 * (lib/chat/demo.ts).
 */
export default function ChatScreen() {
	const params = useLocalSearchParams<{
		context?: string;
		projectId?: string;
		projectName?: string;
		sessionId?: string;
		from?: string;
		focusKind?: string;
		focusId?: string;
		focusName?: string;
		demo?: string;
		autofocus?: string;
		history?: string;
	}>();
	const openedWith = useMemo(
		() => parseTargetParams(params),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			params.context,
			params.projectId,
			params.projectName,
			params.focusKind,
			params.focusId,
			params.focusName
		]
	);
	const demo = DEV ? parseDemoParam(params.demo) : null;
	const openedSession = typeof params.sessionId === 'string' ? params.sessionId : null;
	// What this chat is about. Starts from how it was opened; the picker and the focus sheet
	// change it, and every send reads it (hooks/use-chat.ts).
	const [target, setTarget] = useState<ChatTarget>(openedWith);
	const [stage, setStage] = useState<ChatStage>(() =>
		initialStage({ target: openedWith, sessionId: openedSession, demo })
	);
	const [focusOpen, setFocusOpen] = useState(demo === 'focus');
	const [query, setQuery] = useState('');
	// Opened again with other params while mounted (a deep link): start over from them.
	useEffect(() => {
		setTarget(openedWith);
		setStage(initialStage({ target: openedWith, sessionId: openedSession, demo }));
		setFocusOpen(demo === 'focus');
	}, [openedWith, openedSession, demo]);
	// Any value focuses; a new value re-focuses, so screenshots can reopen the keyboard.
	const autoFocus = DEV && typeof params.autofocus === 'string' ? params.autofocus : null;
	const chat = useChat(target, openedSession, { demo });
	const desktop = useDesktop();
	const { colors } = useInk();
	const [history, setHistory] = useState(false);
	useEffect(() => {
		if (DEV && typeof params.history === 'string') setHistory(params.history === '1');
	}, [params.history]);
	const [jump, setJump] = useState(false);
	const listRef = useRef<FlatList<ChatRow>>(null);
	const label = targetLabel(target);
	const from =
		typeof params.from === 'string' && params.from ? params.from : targetLabel(openedWith);
	const streaming = chat.activeTurn !== null;
	const focus = focusLabel(target);
	const described = describeTarget(target);
	const empty = chat.rows.length === 0;
	const newestFirst = useMemo(() => [...chat.rows].reverse(), [chat.rows]);
	const { chooseProposal, undoProposal, undoChange } = chat;
	// Website pages open signed in (a one-time handoff code); a plain open is the fallback.
	const openOnWeb = useCallback((path: string) => {
		void openWebPage(path, {
			createHandoff: (input) => api.auth.createHandoff(input),
			open: (url) => WebBrowser.openBrowserAsync(url)
		}).catch(() => WebBrowser.openBrowserAsync(`${api.baseUrl}${path}`));
	}, []);
	// What the agent made or edited: tasks and docs in the reader over the chat, a project on
	// its page (the chat closes), the kinds the phone has no screen for on the website.
	const openEntity = useCallback(
		(entity: CreatedEntity) => {
			if (entity.kind === 'task' || entity.kind === 'document') {
				setReaderWalk(null);
				router.push({ pathname: '/reader', params: { kind: entity.kind, id: entity.id } });
				return;
			}
			if (entity.kind === 'project') {
				router.navigate({
					pathname: '/(tabs)/(workspace)/projects',
					params: { [OPEN_PROJECT_PARAM]: entity.id }
				});
				return;
			}
			const path = entityWebPath(entity);
			if (path) openOnWeb(path);
		},
		[openOnWeb]
	);
	const actions = useMemo(
		() => ({
			chooseProposal,
			undoProposal,
			undoChange,
			openEntity,
			openOnWeb,
			turnActive: streaming
		}),
		[chooseProposal, undoProposal, undoChange, openEntity, openOnWeb, streaming]
	);
	// Scripted earlier chats for the demo states that show a conversation; `idle` and the
	// opening screens list the real ones.
	const demoHistory = useMemo(
		() => (demo && demoHasSession(demo) ? demoChats(Date.now()) : undefined),
		[demo]
	);
	// Earlier chats: the Workspace's on the picker, the chosen context's on an empty chat.
	const workspaceChats = useChatSessions(GLOBAL_TARGET, stage === 'pick' && !demoHistory);
	const contextChats = useChatSessions(
		target,
		stage === 'chat' && empty && !chat.loading && !demoHistory
	);

	const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
		const next = showJumpToLatest(event.nativeEvent.contentOffset.y);
		setJump((current) => (current === next ? current : next));
	}, []);
	const jumpToLatest = () => listRef.current?.scrollToOffset({ offset: 0, animated: true });

	const choose = (next: ChatTarget) => {
		setTarget(next);
		setQuery('');
		setStage('chat');
	};
	// The web's back-to-picker: a fresh draft; a chat with messages stays under Earlier chats.
	const changeContext = () => {
		if (!empty) chat.startNew();
		setFocusOpen(false);
		setStage('pick');
	};
	const openEarlier = (id: string) => {
		setHistory(false);
		setStage('chat');
		chat.open(id);
	};
	const onStrip = () => {
		if (streaming) return;
		playHaptic('selection');
		if (empty || target.type !== 'project') changeContext();
		else setFocusOpen(true);
	};
	const setFocus = (next: ChatFocus | null) => {
		if (target.type !== 'project') return;
		setFocusOpen(false);
		setTarget({ ...target, focus: next ?? undefined });
	};
	const stripHint = streaming ? null : empty || target.type !== 'project' ? 'Change' : 'Focus';

	if (stage !== 'chat') {
		return (
			<View style={[styles.root, { backgroundColor: colors.bench }]}>
				<Stack.Screen options={{ title: 'Chat' }} />
				<NavBar
					back={
						stage === 'projects'
							? { label: 'Back', onPress: () => setStage('pick') }
							: { label: from, onPress: () => router.back() }
					}
				/>
				<Sheet style={styles.sheet}>
					<ContextPicker
						stage={stage}
						projects={desktop.data?.projects}
						projectsLoading={desktop.isPending}
						earlierChats={demoHistory ?? workspaceChats.data?.chats}
						earlierLoading={workspaceChats.isPending && !demoHistory}
						query={query}
						onQuery={setQuery}
						onWorkspace={() => choose(GLOBAL_TARGET)}
						onProjects={() => setStage('projects')}
						onProject={(project) =>
							choose({
								type: 'project',
								projectId: project.id,
								projectName: project.name
							})
						}
						onOpenChat={(id) => {
							choose(GLOBAL_TARGET);
							openEarlier(id);
						}}
					/>
				</Sheet>
			</View>
		);
	}

	return (
		<ChatActionsContext value={actions}>
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
								accessibilityHint={`A fresh chat about ${label}`}
								disabled={!chat.sessionId}
								onPress={chat.startNew}
							/>
						</>
					}
				/>
				<Sheet style={styles.sheet}>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={`Chatting about ${focus ? `${focus} in ${label}` : label}`}
						accessibilityHint={
							streaming
								? 'Wait for the reply to finish to change it'
								: empty || target.type !== 'project'
									? 'Choose what to chat about'
									: 'Choose what in this project to work from'
						}
						disabled={streaming}
						onPress={onStrip}
						style={({ pressed }) => [
							styles.context,
							{ borderBottomColor: withAlpha(colors.border, 0.7) },
							pressed && { backgroundColor: colors.muted }
						]}
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
							{focus ? `${label} · ${focus}` : label}
						</Text>
						{stripHint ? (
							<View style={styles.contextEnd}>
								<MicroLabel tone="accent">{stripHint}</MicroLabel>
								<ChevronRight size={14} color={colors.accent} />
							</View>
						) : null}
					</Pressable>
					<View style={styles.body}>
						{chat.loading && empty ? (
							<View style={styles.center}>
								<BoltSpinner size={28} label="Opening this chat" />
							</View>
						) : empty ? (
							<View style={styles.empty}>
								<View style={styles.emptyText}>
									<MicroLabel>Chat about</MicroLabel>
									<Text
										maxFontSizeMultiplier={1.4}
										style={[typeScale.title, { color: colors.foreground }]}
									>
										{described.title}
									</Text>
									<Text
										maxFontSizeMultiplier={1.5}
										style={[typeScale.body, { color: colors.mutedForeground }]}
									>
										{described.subtitle} I can change things too; you see every
										step.
									</Text>
								</View>
								<EarlierChats
									chats={demoHistory ?? contextChats.data?.chats}
									loading={contextChats.isPending && !demoHistory}
									onOpen={openEarlier}
								/>
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
						{jump && !empty ? (
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
						placeholder={`Ask about ${described.title}`}
						autoFocus={autoFocus}
						above={
							chat.pendingChange ? (
								<PendingChangeStrip
									view={chat.pendingChange}
									busy={chat.pendingBusy}
									disabled={streaming}
									onFinish={() => void chat.finishPendingChange()}
									onDismiss={() => void chat.dismissPendingChange()}
								/>
							) : null
						}
					/>
				</Sheet>
				<HistorySheet
					visible={history}
					target={target}
					currentSessionId={chat.sessionId}
					chats={demoHistory}
					onClose={() => setHistory(false)}
					onOpen={openEarlier}
				/>
				{target.type === 'project' ? (
					<FocusSheet
						visible={focusOpen}
						projectId={target.projectId}
						projectName={target.projectName}
						current={target.focus}
						onSelect={setFocus}
						onSomethingElse={changeContext}
						onClose={() => setFocusOpen(false)}
					/>
				) : null}
			</View>
		</ChatActionsContext>
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
	contextEnd: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2 },
	body: { flex: 1 },
	// Inverted: paddingTop is the gap above the composer, paddingBottom the gap under the header.
	list: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, gap: 16 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	empty: { flex: 1, justifyContent: 'flex-end', paddingBottom: 10 },
	emptyText: { padding: 18, paddingBottom: 6, gap: spacing.sm },
	jump: { position: 'absolute', right: 14, bottom: 10 }
});
