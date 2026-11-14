// apps/mobile/src/components/chat/rows.tsx
// The three kinds of row in a chat: what you said, what the agent did, what it answered.
// Each is memoized on its row object; the store only replaces the row that changed.
import { memo, useEffect, useMemo, useState } from 'react';
import { Image, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import {
	BoltSpinner,
	Check,
	ChevronDown,
	ChevronRight,
	CircleAlert,
	CircleSlash,
	playHaptic
} from '@/components/kit';
import { Markdown } from '@/components/markdown';
import { api } from '@/lib/api';
import type { MessageImage } from '@/lib/chat/images';
import type { AssistantRow, UserRow, WorkRow } from '@/lib/chat/session-store';
import { buildTurnView } from '@/lib/chat/turn-view';
import { workAside, workHeadline } from '@/lib/chat/work-summary';
import { useAuth } from '@/providers/auth-provider';
import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { radius, spacing, typeScale, withAlpha } from '@/theme';

import { useChatActions } from './chat-actions';
import { foldedAside, TurnDetail } from './work-detail';

/** What you said: right-aligned on an accent-tinted card, as on the website. */
export const UserBubble = memo(function UserBubble({ row }: { row: UserRow }) {
	const ink = useInk();
	const { colors } = ink;
	return (
		<View style={styles.userWrap}>
			<View
				style={[
					styles.userBubble,
					{
						backgroundColor: withAlpha(colors.accent, 0.07),
						borderColor: withAlpha(colors.accent, 0.3),
						boxShadow: ink.shadows.ink,
						opacity: row.delivery === 'sending' ? 0.7 : 1
					}
				]}
			>
				{row.images?.length ? <MessageImages images={row.images} /> : null}
				{row.text ? (
					<Text
						selectable
						style={[typeScale.row, styles.userText, { color: colors.foreground }]}
					>
						{row.text}
					</Text>
				) : null}
			</View>
			{row.delivery === 'failed' ? (
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.small, styles.userMeta, { color: colors.destructive }]}
				>
					Not sent
				</Text>
			) : null}
		</View>
	);
});

/**
 * Images on a sent message. Stored previews are site paths that need the signed-in bearer; a
 * Workspace chat's images were temporary files and show as a placeholder after a reload.
 */
function MessageImages({ images }: { images: MessageImage[] }) {
	const { colors } = useInk();
	const { session } = useAuth();
	const token = session?.access_token;
	return (
		<View style={styles.images}>
			{images.map((image) =>
				image.uri ? (
					<Image
						key={image.key}
						accessibilityLabel={image.fileName ?? 'Attached image'}
						source={
							image.remote
								? {
										uri: `${api.baseUrl}${image.uri}`,
										headers: token
											? { Authorization: `Bearer ${token}` }
											: undefined
									}
								: { uri: image.uri }
						}
						style={[styles.image, { borderColor: colors.border }]}
					/>
				) : (
					<View
						key={image.key}
						accessibilityLabel={image.fileName ?? 'Attached image'}
						style={[
							styles.image,
							styles.imagePlaceholder,
							{ borderColor: colors.border, backgroundColor: colors.muted }
						]}
					>
						<Text style={[typeScale.small, { color: colors.mutedForeground }]}>
							IMG
						</Text>
					</View>
				)
			)}
		</View>
	);
}

/** The answer, as native markdown; the live preview trails it in muted ink until it is durable. */
export const AssistantText = memo(function AssistantText({ row }: { row: AssistantRow }) {
	const { colors } = useInk();
	if (!row.text && !row.preview) return null;
	return (
		<View style={styles.assistant}>
			{row.text ? <Markdown source={row.text} /> : null}
			{row.preview ? (
				<Text selectable style={[typeScale.body, { color: colors.mutedForeground }]}>
					{row.preview}
				</Text>
			) : null}
			{row.status === 'stopped' ? (
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.small, { color: colors.mutedForeground }]}
				>
					Stopped
				</Text>
			) : null}
		</View>
	);
});

/** A one-second clock, only while a row is active, so "12s" counts up like the web's. */
function useTicking(active: boolean) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [active]);
	return active ? now : Date.now();
}

/**
 * What the agent is doing: one live line while it works (the last step, or its status), the
 * steps beneath; when it is done, "Worked for 54s · 3 steps" folded up, tap to see the steps.
 */
export const WorkBlock = memo(function WorkBlock({ row }: { row: WorkRow }) {
	const { colors } = useInk();
	const reduceMotion = useReducedMotion();
	const active = row.status === 'active';
	const now = useTicking(active);
	const [expanded, setExpanded] = useState(false);
	const open = active || expanded;
	const { sessionProject } = useChatActions();
	// Cards, "Pulled in" and the receipt by the website's rules (lib/chat/turn-view.ts).
	const view = useMemo(() => buildTurnView(row, sessionProject), [row, sessionProject]);
	const headline = workHeadline(row);
	const aside = active ? workAside(row, now) : foldedAside(view, row.steps.length);
	const hasBody = row.steps.length > 0 || view.grouped;
	const canExpand = !active && hasBody;
	const tone =
		row.status === 'error'
			? colors.destructive
			: row.status === 'cancelled'
				? colors.mutedForeground
				: active
					? colors.foreground
					: colors.mutedForeground;
	const Glyph =
		row.status === 'error' ? CircleAlert : row.status === 'cancelled' ? CircleSlash : Check;
	const toggle = () => {
		playHaptic('selection');
		if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
		setExpanded((value) => !value);
	};
	return (
		<View
			style={[
				styles.work,
				{ borderLeftColor: active ? withAlpha(colors.accent, 0.6) : colors.border }
			]}
		>
			<Pressable
				disabled={!canExpand}
				accessibilityRole={canExpand ? 'button' : undefined}
				accessibilityState={canExpand ? { expanded } : undefined}
				accessibilityLabel={aside ? `${headline}, ${aside}` : headline}
				accessibilityLiveRegion={active ? 'polite' : 'none'}
				hitSlop={{ top: 6, bottom: 6 }}
				onPress={toggle}
				style={styles.workHead}
			>
				<View style={styles.workGlyph}>
					{active ? (
						<BoltSpinner size={15} label="" />
					) : (
						<Glyph size={14} color={tone} strokeWidth={2.4} />
					)}
				</View>
				<Text
					numberOfLines={1}
					maxFontSizeMultiplier={1.5}
					style={[typeScale.row, styles.workTitle, { color: tone }]}
				>
					{headline}
				</Text>
				{aside ? (
					<Text
						maxFontSizeMultiplier={1.5}
						style={[
							typeScale.meta,
							styles.workAside,
							{ color: colors.mutedForeground }
						]}
					>
						{active ? aside : `·  ${aside}`}
					</Text>
				) : null}
				{canExpand ? (
					expanded ? (
						<ChevronDown size={14} color={colors.mutedForeground} strokeWidth={2.2} />
					) : (
						<ChevronRight size={14} color={colors.mutedForeground} strokeWidth={2.2} />
					)
				) : null}
			</Pressable>
			{open && hasBody ? <TurnDetail view={view} active={active} /> : null}
		</View>
	);
});

const styles = StyleSheet.create({
	userWrap: { alignItems: 'flex-end', gap: 4, paddingLeft: 36 },
	userBubble: {
		maxWidth: '100%',
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: radius.md,
		borderBottomRightRadius: radius.xs,
		borderWidth: 1
	},
	userText: { lineHeight: 21 },
	images: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
	image: { width: 72, height: 72, borderRadius: 10, borderWidth: 1 },
	imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
	userMeta: { marginRight: 4 },
	assistant: { gap: spacing.sm, paddingRight: 4 },
	work: { borderLeftWidth: 2, paddingLeft: 12, gap: 8, paddingVertical: 2 },
	workHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 },
	workGlyph: { width: 16, alignItems: 'center', justifyContent: 'center' },
	workTitle: { flexShrink: 1 },
	workAside: { fontVariant: ['tabular-nums'] }
});
