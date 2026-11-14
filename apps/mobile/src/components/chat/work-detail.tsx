// apps/mobile/src/components/chat/work-detail.tsx
// The inside of an opened work row, as the website's thinking block draws it (tasker 153/155):
// a card per project the turn touched, what the context finder pulled in or carried from last
// turn, and every step with its action badge, the records it touched (tap to open), before →
// after for edits, body +/− lines, and the person's words the change came from.
import type { StepDetails, StepEntity } from '@buildos/agentic-chat-client';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { playHaptic } from '@/components/kit';
import type { CreatedEntityKind } from '@/lib/chat/changes';
import { doneVerb, verbObject } from '@/lib/chat/tool-lines';
import {
	ACTION_LABEL,
	type TurnCardView,
	type TurnStepView,
	type TurnView
} from '@/lib/chat/turn-view';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

import { useChatActions } from './chat-actions';

/** Steps a card shows before "Show N more": the newest while running, the first ones after. */
const VISIBLE_STEPS = 6;

export function TurnDetail({ view, active }: { view: TurnView; active: boolean }) {
	const { colors } = useInk();
	return (
		<View style={styles.detail}>
			{view.picked ? (
				<Text
					maxFontSizeMultiplier={1.5}
					style={[typeScale.small, { color: colors.mutedForeground }]}
				>
					{view.picked}
				</Text>
			) : null}
			{view.cards.map((card) => (
				<TurnCard key={card.key} card={card} grouped={view.grouped} active={active} />
			))}
		</View>
	);
}

function TurnCard({
	card,
	grouped,
	active
}: {
	card: TurnCardView;
	grouped: boolean;
	active: boolean;
}) {
	const { colors } = useInk();
	const [all, setAll] = useState(false);
	const hidden = all ? 0 : Math.max(0, card.steps.length - VISIBLE_STEPS);
	const visible =
		hidden === 0
			? card.steps
			: active
				? card.steps.slice(-VISIBLE_STEPS)
				: card.steps.slice(0, VISIBLE_STEPS);
	const count = card.steps.length;
	return (
		<View
			style={grouped ? [styles.card, { borderColor: withAlpha(colors.border, 0.8) }] : null}
		>
			{grouped && card.name ? (
				<View style={styles.cardHead}>
					<View
						style={[
							styles.cardDot,
							{
								backgroundColor: card.projectId
									? colors.accent
									: colors.mutedForeground
							}
						]}
					/>
					<Text
						numberOfLines={1}
						maxFontSizeMultiplier={1.4}
						style={[styles.cardName, { color: colors.foreground }]}
					>
						{card.name}
					</Text>
					{count > 0 ? (
						<Text style={[typeScale.small, { color: colors.mutedForeground }]}>
							{count} {count === 1 ? 'step' : 'steps'}
						</Text>
					) : null}
				</View>
			) : null}
			{card.carried?.length ? (
				<Text
					maxFontSizeMultiplier={1.5}
					style={[typeScale.small, { color: colors.mutedForeground }]}
				>
					<Text style={{ color: colors.foreground }}>↻ Carried from last turn</Text>
					{` · ${card.carried.join(' · ')}`}
				</Text>
			) : null}
			{card.pulled ? (
				<Text
					maxFontSizeMultiplier={1.5}
					style={[typeScale.small, { color: colors.mutedForeground }]}
				>
					<Text style={{ color: colors.accent }}>✦ </Text>
					<Text style={{ color: colors.foreground }}>{card.pulled.label}</Text>
					{card.pulled.detail ? ` · ${card.pulled.detail}` : ''}
				</Text>
			) : null}
			{visible.length > 0 ? (
				<View style={styles.steps}>
					{visible.map((entry) => (
						<StepRow key={entry.step.id} entry={entry} active={active} />
					))}
				</View>
			) : null}
			{hidden > 0 ? (
				<Pressable
					accessibilityRole="button"
					hitSlop={{ top: 8, bottom: 8 }}
					onPress={() => {
						playHaptic('selection');
						setAll(true);
					}}
				>
					<Text style={[typeScale.small, styles.more, { color: colors.mutedForeground }]}>
						Show {hidden} more
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}

function StepRow({ entry, active }: { entry: TurnStepView; active: boolean }) {
	const { colors } = useInk();
	const { step, details } = entry;
	const live = active && step.status === 'pending';
	const done = step.status === 'completed';
	const badge = done ? details.action : null;
	// With a badge the badge is the verb ("[Updated] task"); otherwise finished steps read past.
	const verb = badge
		? (verbObject(step.verb) ?? doneVerb(step.verb))
		: done
			? doneVerb(step.verb)
			: step.verb;
	return (
		<View style={styles.step}>
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
			<View style={styles.stepBody}>
				<View style={styles.stepLine}>
					{badge ? <ActionBadge action={badge} /> : null}
					<Text
						numberOfLines={2}
						maxFontSizeMultiplier={1.5}
						style={[
							typeScale.meta,
							styles.stepText,
							{ color: live ? colors.foreground : colors.mutedForeground }
						]}
					>
						{verb}
						{step.target ? (
							<Text style={{ color: withAlpha(colors.mutedForeground, 0.8) }}>
								{'  ·  '}
								{step.target}
							</Text>
						) : null}
					</Text>
				</View>
				{done ? <StepWhere details={details} hasTarget={Boolean(step.target)} /> : null}
			</View>
		</View>
	);
}

function ActionBadge({ action }: { action: NonNullable<StepDetails['action']> }) {
	const { colors } = useInk();
	const tone =
		action === 'created'
			? colors.success
			: action === 'archived' || action === 'deleted'
				? colors.mutedForeground
				: colors.accent;
	return (
		<Text
			maxFontSizeMultiplier={1.3}
			style={[
				styles.badge,
				{
					color: tone,
					backgroundColor: withAlpha(tone, 0.12),
					borderColor: withAlpha(tone, 0.25)
				}
			]}
		>
			{ACTION_LABEL[action]}
		</Text>
	);
}

const OPENABLE: ReadonlySet<string> = new Set([
	'project',
	'task',
	'document',
	'goal',
	'plan',
	'milestone',
	'risk'
]);

/** "Where it went": the person's words, the records, before → after, body +/−. */
function StepWhere({ details, hasTarget }: { details: StepDetails; hasTarget: boolean }) {
	const { colors } = useInk();
	const { openEntity } = useChatActions();
	// One record already named in the step line needs no chip.
	const entities = details.entities.length === 1 && hasTarget ? [] : details.entities;
	if (!details.quote && !entities.length && !details.changes.length && !details.docChange)
		return null;
	const open = (entity: StepEntity) => {
		if (!OPENABLE.has(entity.kind)) return;
		playHaptic('selection');
		openEntity({
			kind: entity.kind as CreatedEntityKind,
			id: entity.id,
			name: entity.title,
			projectId: entity.projectId
		});
	};
	return (
		<View style={styles.where}>
			{details.quote ? (
				<Text
					maxFontSizeMultiplier={1.5}
					style={[
						typeScale.small,
						styles.quote,
						{ color: colors.foreground, borderLeftColor: withAlpha(colors.accent, 0.5) }
					]}
				>
					“{details.quote}”
				</Text>
			) : null}
			{entities.length ? (
				<View style={styles.chips}>
					{entities.map((entity) => (
						<Pressable
							key={`${entity.kind}:${entity.id}`}
							accessibilityRole="link"
							accessibilityLabel={`Open ${entity.kind} ${entity.title}`}
							onPress={() => open(entity)}
							style={({ pressed }) => [
								styles.chip,
								{
									borderColor: colors.border,
									backgroundColor: pressed ? colors.muted : colors.card
								}
							]}
						>
							<Text
								numberOfLines={1}
								maxFontSizeMultiplier={1.3}
								style={[styles.chipText, { color: colors.foreground }]}
							>
								{entity.title}
							</Text>
						</Pressable>
					))}
					{details.more ? (
						<Text style={[typeScale.small, { color: colors.mutedForeground }]}>
							+{details.more} more
						</Text>
					) : null}
				</View>
			) : null}
			{details.changes.map((change) => (
				<Text
					key={change.field}
					maxFontSizeMultiplier={1.5}
					style={[typeScale.small, { color: colors.foreground }]}
				>
					<Text style={{ color: colors.mutedForeground }}>{change.label} </Text>
					{change.before !== null ? (
						<>
							<Text
								style={{
									color: colors.mutedForeground,
									textDecorationLine: 'line-through'
								}}
							>
								{change.before}
							</Text>
							<Text style={{ color: colors.mutedForeground }}>{'  →  '}</Text>
						</>
					) : null}
					{change.after ?? 'cleared'}
				</Text>
			))}
			{details.docChange ? (
				<Text
					maxFontSizeMultiplier={1.5}
					style={[typeScale.small, { color: colors.mutedForeground }]}
				>
					Body <Text style={{ color: colors.success }}>+{details.docChange.added}</Text>{' '}
					<Text style={{ color: colors.destructive }}>−{details.docChange.removed}</Text>{' '}
					{details.docChange.added + details.docChange.removed === 1 ? 'line' : 'lines'}
				</Text>
			) : null}
		</View>
	);
}

/** The folded line's aside once done: "2 projects · 5 steps", or the receipt when it changed things. */
export function foldedAside(view: TurnView, stepCount: number): string | null {
	if (view.receipt) return view.receipt;
	if (stepCount === 0) return null;
	const steps = `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`;
	return view.projectCount > 1 ? `${view.projectCount} projects · ${steps}` : steps;
}

const styles = StyleSheet.create({
	detail: { gap: 10, paddingBottom: 2 },
	card: { gap: 7, padding: 10, borderWidth: 1, borderRadius: 10 },
	cardHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
	cardDot: { width: 7, height: 7, borderRadius: 4 },
	cardName: { flexShrink: 1, fontSize: 13.5, lineHeight: 18, fontWeight: '600' },
	steps: { gap: 8 },
	step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingLeft: 5 },
	stepDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
	stepBody: { flex: 1, minWidth: 0, gap: 4 },
	stepLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
	stepText: { flex: 1 },
	badge: {
		fontSize: 10.5,
		lineHeight: 14,
		fontWeight: '700',
		paddingHorizontal: 5,
		paddingVertical: 1,
		marginTop: 1,
		borderWidth: 1,
		borderRadius: 5,
		overflow: 'hidden'
	},
	where: { gap: 4 },
	quote: { fontStyle: 'italic', paddingLeft: 8, borderLeftWidth: 2 },
	chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
	chip: {
		maxWidth: 220,
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 6,
		borderWidth: 1
	},
	chipText: { fontSize: 12.5, lineHeight: 16, fontWeight: '500' },
	more: { paddingLeft: 21 }
});
