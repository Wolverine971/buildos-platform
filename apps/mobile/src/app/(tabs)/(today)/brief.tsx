// apps/mobile/src/app/(tabs)/(today)/brief.tsx
import { BuildOsApiError } from '@buildos/api-client';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { BriefNotice, BriefPlayer, StartHere } from '@/components/brief';
import { ChatKey } from '@/components/chat/chat-key';
import {
	BoltSpinner,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	Key,
	NavBar,
	NavKey,
	PageTitle,
	Stamp
} from '@/components/kit';
import { Markdown } from '@/components/markdown';
import { Screen, SCREEN_PADDING } from '@/components/screen';
import { formatDay, SectionHead, TodayNotice } from '@/components/today';
import { useBrief } from '@/hooks/use-brief';
import { useBriefAudio } from '@/hooks/use-brief-audio';
import { useTabStack } from '@/hooks/use-tab-stack';
import { api, unreachableMessage } from '@/lib/api';
import {
	briefActions,
	briefLinkTarget,
	briefStatus,
	civilDayParam,
	splitBrief,
	stepDay
} from '@/lib/brief';
import { GLOBAL_TARGET } from '@/lib/chat/context';
import { civilDay } from '@/lib/due-date';
import { setReaderWalk } from '@/lib/reader-walk';
import { projectHref } from '@/lib/routes';
import { useInk } from '@/providers/theme-provider';

/**
 * The daily brief, pushed on Today's stack so the tab bar stays: the date with when it was
 * written and Prev/Next day keys, Listen when the narration exists, the executive brief, the
 * priority actions as rows that open their tasks, the rest of the readout, the analysis, and
 * the per-project details folded behind one key (they are most of the document). Links in the
 * brief open the project or task in the app. Reachable as /brief, /brief?date=YYYY-MM-DD and
 * /brief?autoplay=1 (the card's Listen chip).
 */
export default function BriefScreen() {
	const { colors } = useInk();
	const tab = useTabStack();
	const params = useLocalSearchParams<{ date?: string; autoplay?: string }>();
	const today = civilDay(new Date());
	// The day lives in the route, so a link into an open page and Prev/Next agree with the URL.
	const date = civilDayParam(params.date) ?? today;
	const [detailsFor, setDetailsFor] = useState<string | null>(null);
	const showDetails = detailsFor === date;
	const [pulling, setPulling] = useState(false);

	const query = useBrief(date);
	const brief = query.data ?? null;
	const sections = useMemo(() => (brief ? splitBrief(brief.summary_content) : null), [brief]);
	const actions = useMemo(
		() => (brief ? briefActions(brief.priority_actions, sections?.startHere ?? null) : []),
		[brief, sections]
	);
	// Older briefs had no executive brief, and the analysis stood in for the body: show it once.
	const insights =
		brief?.insights && brief.insights.trim() !== brief.summary_content.trim()
			? brief.insights
			: null;
	const status = briefStatus(brief);
	const audio = useBriefAudio(brief, params.autoplay === '1');
	const empty = Boolean(sections && !sections.lead && !sections.body && !sections.details);

	const go = (days: number) => router.setParams({ date: stepDay(date, days) });

	const refresh = useCallback(() => {
		setPulling(true);
		void query.refetch().finally(() => setPulling(false));
	}, [query]);

	const openLink = useCallback(
		(href: string) => {
			const target = briefLinkTarget(href, api.baseUrl);
			if (!target) return;
			switch (target.kind) {
				case 'workspace':
					router.navigate('/(tabs)/(workspace)/projects');
					return;
				case 'project':
					router.push(projectHref(tab, target.id));
					return;
				case 'task':
				case 'document':
					// No Prev/Next: the brief is not a list to walk.
					setReaderWalk(null);
					router.push({
						pathname: '/reader',
						params: { kind: target.kind, id: target.id }
					});
					return;
				case 'web':
					if (/^https?:/i.test(target.url)) {
						void WebBrowser.openBrowserAsync(target.url, {
							controlsColor: colors.accent,
							dismissButtonStyle: 'done'
						}).catch(() => {});
					} else {
						void Linking.openURL(target.url).catch(() => {});
					}
			}
		},
		[colors.accent, tab]
	);

	const openOnWeb = () =>
		void WebBrowser.openBrowserAsync(`${api.baseUrl}/briefs?date=${date}`, {
			controlsColor: colors.accent,
			dismissButtonStyle: 'done'
		}).catch(() => {});

	return (
		<>
			<Stack.Screen options={{ headerShown: false, title: 'Your brief' }} />
			<Screen
				header={
					<NavBar
						back={{ label: 'Today' }}
						right={
							<>
								<ChatKey target={GLOBAL_TARGET} from="Your brief" />
								<NavKey
									icon={ExternalLink}
									onPress={openOnWeb}
									accessibilityLabel="Open on the web"
									accessibilityHint="Opens this brief on the BuildOS website"
								/>
							</>
						}
					/>
				}
				refreshing={pulling}
				onRefresh={refresh}
			>
				<View>
					<PageTitle title="Your brief" aside={formatDay(date)} />
					<View style={styles.statusRow}>
						<View
							style={styles.status}
							accessible
							accessibilityLiveRegion="polite"
							accessibilityLabel={status?.text}
						>
							{status?.writing ? (
								<BoltSpinner size={14} label="Being written" />
							) : null}
							{status ? (
								<Stamp tone={status.tone} style={styles.statusText}>
									{status.text}
								</Stamp>
							) : null}
						</View>
						<View style={styles.stepper}>
							<Key
								icon={ChevronLeft}
								size="sm"
								accessibilityLabel="Previous day"
								onPress={() => go(-1)}
							/>
							<Key
								icon={ChevronRight}
								size="sm"
								disabled={date >= today}
								accessibilityLabel="Next day"
								onPress={() => go(1)}
							/>
						</View>
					</View>
				</View>

				{query.isError ? (
					<TodayNotice
						tone="error"
						title={brief ? "Couldn't refresh your brief" : "Couldn't load your brief"}
						detail={describeError(query.error)}
						onRetry={() => void query.refetch()}
						retrying={query.isFetching && !pulling}
					/>
				) : null}

				{query.isPending ? (
					<View style={styles.loading}>
						<BoltSpinner size={34} label="Loading your brief" />
					</View>
				) : null}

				{query.isSuccess && !brief ? (
					<BriefNotice variant="none" today={date === today} />
				) : null}
				{brief && status?.writing && empty ? (
					<BriefNotice variant="writing" today={date === today} />
				) : null}

				{audio.available ? <BriefPlayer audio={audio} /> : null}

				{sections?.lead ? <Markdown source={sections.lead} onLink={openLink} /> : null}
				{actions.length ? <StartHere actions={actions} onOpen={openLink} /> : null}
				{sections?.body ? <Markdown source={sections.body} onLink={openLink} /> : null}
				{insights ? <Markdown source={insights} onLink={openLink} /> : null}

				{sections?.details ? (
					showDetails ? (
						<View style={styles.details}>
							<SectionHead title="Project details" count={sections.detailCount} />
							<Markdown source={sections.details} onLink={openLink} />
						</View>
					) : (
						<Key
							title={`Show project details · ${sections.detailCount}`}
							icon={ChevronDown}
							size="sm"
							accessibilityHint="Shows every project's section of the brief"
							onPress={() => setDetailsFor(date)}
							style={styles.showDetails}
						/>
					)
				) : null}
			</Screen>
		</>
	);
}

function describeError(error: unknown): string {
	if (error instanceof BuildOsApiError && error.isUnauthorized()) {
		return 'You are signed in, but BuildOS could not authorize this request. Try again shortly.';
	}
	if (error && typeof error === 'object' && 'isNetworkError' in error && error.isNetworkError) {
		return unreachableMessage('No connection. Your brief will load when you are back online.');
	}
	return error instanceof Error ? error.message : 'Something went wrong.';
}

const styles = StyleSheet.create({
	statusRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 12,
		marginTop: 6
	},
	status: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
	statusText: { flexShrink: 1 },
	stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	loading: {
		flexGrow: 1,
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: 160,
		paddingVertical: 32
	},
	details: { gap: SCREEN_PADDING },
	showDetails: { alignSelf: 'flex-start' }
});
