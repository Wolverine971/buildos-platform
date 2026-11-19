// apps/mobile/src/app/(tabs)/(today)/inbox.tsx
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ChatKey } from '@/components/chat/chat-key';
import {
	CheckInCard,
	CleanupCard,
	DoneRow,
	EmailUpdateCard,
	ItemCard,
	PileBar,
	TextKey
} from '@/components/inbox';
import { BoltSpinner, ChevronRight, Inbox as InboxIcon, NavBar, PageTitle } from '@/components/kit';
import { Screen, SCREEN_PADDING } from '@/components/screen';
import { SectionHead, TodayNotice } from '@/components/today';
import { useInbox } from '@/hooks/use-inbox';
import { useTabStack } from '@/hooks/use-tab-stack';
import { api, unreachableMessage } from '@/lib/api';
import { GLOBAL_TARGET } from '@/lib/chat/context';
import { usePile } from '@/lib/inbox/inbox-store';
import { projectHref } from '@/lib/routes';
import { openWebPage, WEB_PAGES } from '@/lib/web-pages';
import { useInk } from '@/providers/theme-provider';
import { typeScale } from '@/theme';

/**
 * The AI Inbox (the web's Assistant's Desk), pushed on Today's stack so the tab bar stays:
 * email updates and check-ins first, then one section per project — its cleanup list and any
 * other cards — Account first. Answers leave at once and wait five seconds in the pile at the
 * bottom with Undo; "Talk it through" opens the chat seeded with the item.
 */
export default function InboxScreen() {
	const ink = useInk();
	const { colors } = ink;
	const tab = useTabStack();
	const inbox = useInbox();
	// Dev only: `/inbox?skip=2` starts at the third section (the simulator has no scroll gesture).
	const params = useLocalSearchParams<{ skip?: string }>();
	const skip = __DEV__ ? Math.max(0, Number(params.skip) || 0) : 0;
	const pile = usePile();
	const [pulling, setPulling] = useState(false);

	const refresh = useCallback(() => {
		setPulling(true);
		void inbox.refresh().finally(() => setPulling(false));
	}, [inbox]);

	const reconnect = useCallback(async () => {
		try {
			await openWebPage(WEB_PAGES.email, {
				createHandoff: (input) => api.auth.createHandoff(input),
				open: (url) =>
					WebBrowser.openBrowserAsync(url, {
						controlsColor: colors.accent,
						dismissButtonStyle: 'done'
					})
			});
			void inbox.refresh();
		} catch (error) {
			Alert.alert(
				"Couldn't open your email settings",
				error instanceof Error ? error.message : 'Try again in a moment.'
			);
		}
	}, [colors.accent, inbox]);

	const empty =
		!inbox.loading &&
		!inbox.error &&
		inbox.sections.length === 0 &&
		inbox.emailUpdates.length === 0;

	return (
		<>
			<Stack.Screen options={{ headerShown: false, title: 'AI Inbox' }} />
			<Screen
				header={
					<NavBar
						back={{ label: 'Today' }}
						right={<ChatKey target={GLOBAL_TARGET} from="AI Inbox" />}
					/>
				}
				refreshing={pulling}
				onRefresh={refresh}
				footer={
					pile.length ? (
						<View style={styles.dock}>
							<PileBar />
						</View>
					) : undefined
				}
			>
				<PageTitle title="AI Inbox" aside={inbox.summary} />

				{inbox.chatError ? (
					<TodayNotice
						tone="warning"
						title="Couldn't open the chat"
						detail={inbox.chatError}
						onRetry={() => void inbox.refresh()}
					/>
				) : null}

				{inbox.error ? (
					<TodayNotice
						tone="error"
						title="Couldn't load your inbox"
						detail={unreachableMessage(inbox.error.message)}
						onRetry={() => void inbox.refresh()}
					/>
				) : null}

				{inbox.loading ? (
					<View style={styles.center}>
						<BoltSpinner label="Loading inbox" />
					</View>
				) : null}

				{empty ? (
					<View style={styles.empty}>
						<InboxIcon size={22} strokeWidth={2} color={colors.mutedForeground} />
						<Text style={[typeScale.section, { color: colors.foreground }]}>
							Nothing needs attention
						</Text>
						<Text
							style={[
								typeScale.meta,
								styles.emptyText,
								{ color: colors.mutedForeground }
							]}
						>
							Agent proposals and source-specific suggestions will appear here when
							they need a decision.
						</Text>
					</View>
				) : null}

				{inbox.emailUpdates.length ? (
					<View style={styles.section}>
						<SectionHead title="From your email" count={inbox.emailUpdates.length} />
						{inbox.emailUpdates.map((entry) => (
							<EmailUpdateCard key={entry.id} entry={entry} inbox={inbox} />
						))}
					</View>
				) : null}

				{inbox.sections.slice(skip).map((section) => (
					<View key={section.key} style={styles.section}>
						<View style={styles.sectionHead}>
							<SectionHead
								title={section.label}
								count={section.openCount}
								style={styles.flex}
							/>
							{section.projectId ? (
								<TextKey
									label="Open project"
									icon={ChevronRight}
									tone="muted"
									accessibilityLabel={`Open ${section.label}`}
									onPress={() =>
										router.push(projectHref(tab, section.projectId!))
									}
								/>
							) : null}
						</View>
						{section.checkIns.map((project) => (
							<CheckInCard key={project.project_id} project={project} inbox={inbox} />
						))}
						{section.cleanups.map((cleanup) => (
							<CleanupCard key={cleanup.item.id} cleanup={cleanup} inbox={inbox} />
						))}
						{section.cards.map((item) => (
							<ItemCard
								key={item.id}
								item={item}
								inbox={inbox}
								onReconnect={() => void reconnect()}
							/>
						))}
					</View>
				))}

				{inbox.doneForYou.length ? (
					<View style={styles.section}>
						<SectionHead
							title="Done for you this week"
							count={inbox.doneForYou.length}
						/>
						{inbox.doneForYou.map((entry) => (
							<DoneRow
								key={entry.suggestion_id}
								title={entry.title}
								reason={entry.reason}
								meta={entry.project_name}
								undoable={entry.undoable}
								busy={inbox.undoing === entry.suggestion_id}
								note={inbox.notes[`auto:${entry.suggestion_id}`]}
								onUndo={() =>
									void inbox.undoAutoApplied(
										entry.project_id,
										entry.suggestion_id,
										entry.undo_url
									)
								}
							/>
						))}
					</View>
				) : null}
			</Screen>
		</>
	);
}

const styles = StyleSheet.create({
	dock: { paddingHorizontal: SCREEN_PADDING, paddingBottom: 10, paddingTop: 6 },
	center: { alignItems: 'center', paddingVertical: 40 },
	empty: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
	emptyText: { textAlign: 'center' },
	section: { gap: 10, marginTop: 18 },
	sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	flex: { flex: 1, minWidth: 0 }
});
