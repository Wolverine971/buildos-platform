// apps/mobile/src/components/chat/rows.tsx
// The three kinds of row in a chat: what you said, what the agent did, what it answered.
// Each is memoized on its row object; the store only replaces the row that changed.
import { memo, useEffect, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

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
import type { AssistantRow, UserRow, WorkRow } from '@/lib/chat/session-store';
import { workAside, workHeadline } from '@/lib/chat/work-summary';
import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { radius, spacing, typeScale, withAlpha } from '@/theme';

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
				<Text
					selectable
					style={[typeScale.row, styles.userText, { color: colors.foreground }]}
				>
					{row.text}
				</Text>
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
	const headline = workHeadline(row);
	const aside = workAside(row, now);
	const canExpand = !active && row.steps.length > 0;
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
			{open && row.steps.length > 0 ? (
				<View style={styles.steps}>
					{row.steps.map((step) => {
						const live = active && step.status === 'pending';
						return (
							<View key={step.id} style={styles.step}>
								<View
									style={[
										styles.stepDot,
										{
											backgroundColor:
												step.status === 'failed'
													? colors.destructive
													: live
														? colors.accent
														: withAlpha(colors.mutedForeground, 0.6)
										}
									]}
								/>
								<Text
									numberOfLines={2}
									maxFontSizeMultiplier={1.5}
									style={[
										typeScale.meta,
										styles.stepText,
										{ color: live ? colors.foreground : colors.mutedForeground }
									]}
								>
									{step.verb}
									{step.target ? (
										<Text
											style={{
												color: withAlpha(colors.mutedForeground, 0.8)
											}}
										>
											{'  ·  '}
											{step.target}
										</Text>
									) : null}
								</Text>
							</View>
						);
					})}
				</View>
			) : null}
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
	userMeta: { marginRight: 4 },
	assistant: { gap: spacing.sm, paddingRight: 4 },
	work: { borderLeftWidth: 2, paddingLeft: 12, gap: 8, paddingVertical: 2 },
	workHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 },
	workGlyph: { width: 16, alignItems: 'center', justifyContent: 'center' },
	workTitle: { flexShrink: 1 },
	workAside: { fontVariant: ['tabular-nums'] },
	steps: { gap: 6, paddingBottom: 2 },
	step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingLeft: 5 },
	stepDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
	stepText: { flex: 1 }
});
