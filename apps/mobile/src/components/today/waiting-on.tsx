// apps/mobile/src/components/today/waiting-on.tsx
// "Waiting on you" and "You're waiting on" (the web's TodayWaitingSection): the open asks the
// morning brief job found. Each row opens its task or project (or drafts a follow-up in chat
// when you're the one waiting), can be marked done, or removed as not a real ask. A row acted
// on stays in place, struck through, with Undo until the next load.
import type { TodayWaitingItem, TodayWaitingStatus } from '@buildos/api-client';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
	Check,
	ChevronRight,
	hitSlopFor,
	type Icon,
	MicroLabel,
	playHaptic,
	Send,
	Undo2,
	X
} from '@/components/kit';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

import { sinceLabel } from './picks';
import { SectionHead } from './sections';

type Settled = 'resolved' | 'dismissed';

export function WaitingOnSection({
	items,
	onOpen,
	onNudge,
	onSetStatus
}: {
	items: TodayWaitingItem[];
	/** Open the linked task in the reader, or the project. */
	onOpen: (item: TodayWaitingItem) => void;
	/** Draft a follow-up in chat. */
	onNudge: (item: TodayWaitingItem) => void;
	/** Resolves false when the save failed, so the row comes back. */
	onSetStatus: (item: TodayWaitingItem, status: TodayWaitingStatus) => Promise<boolean>;
}) {
	const [settled, setSettled] = useState<Record<string, Settled>>({});
	if (items.length === 0) return null;
	const onYou = items.filter((item) => item.direction === 'on_you');
	const onThem = items.filter((item) => item.direction === 'on_them');

	const drop = (id: string) =>
		setSettled((current) => {
			const { [id]: _removed, ...rest } = current;
			return rest;
		});

	const settle = async (item: TodayWaitingItem, status: Settled) => {
		setSettled((current) => ({ ...current, [item.id]: status }));
		if (!(await onSetStatus(item, status))) drop(item.id);
	};

	const undo = async (item: TodayWaitingItem) => {
		const previous = settled[item.id];
		drop(item.id);
		if (!(await onSetStatus(item, 'open')) && previous) {
			setSettled((current) => ({ ...current, [item.id]: previous }));
		}
	};

	const row = (item: TodayWaitingItem) => (
		<WaitingRow
			key={item.id}
			item={item}
			settled={settled[item.id] ?? null}
			onOpen={onOpen}
			onNudge={onNudge}
			onSettle={settle}
			onUndo={undo}
		/>
	);

	return (
		<View>
			{onYou.length > 0 ? (
				<>
					<SectionHead title="Waiting on you" count={onYou.length} />
					{onYou.map(row)}
				</>
			) : null}
			{onThem.length > 0 ? (
				<>
					<SectionHead
						title="You're waiting on"
						count={onThem.length}
						style={onYou.length > 0 ? styles.gap : null}
					/>
					{onThem.map(row)}
				</>
			) : null}
		</View>
	);
}

function WaitingRow({
	item,
	settled,
	onOpen,
	onNudge,
	onSettle,
	onUndo
}: {
	item: TodayWaitingItem;
	settled: Settled | null;
	onOpen: (item: TodayWaitingItem) => void;
	onNudge: (item: TodayWaitingItem) => void;
	onSettle: (item: TodayWaitingItem, status: Settled) => void;
	onUndo: (item: TodayWaitingItem) => void;
}) {
	const { colors } = useInk();
	const since = sinceLabel(item.since);
	const meta = [item.project_name, since].filter(Boolean).join(' · ');
	const canOpen = Boolean(item.task_id || item.project_id);
	const mine = item.direction === 'on_you';
	// Tapping the row does the row's main thing: open what you owe, or draft the follow-up.
	const main = mine ? (canOpen ? () => onOpen(item) : null) : () => onNudge(item);

	return (
		<View style={[styles.row, { borderBottomColor: withAlpha(colors.border, 0.7) }]}>
			<Pressable
				disabled={!main || settled !== null}
				accessibilityRole="button"
				accessibilityLabel={`${item.who}: ${item.what}${meta ? `, ${meta}` : ''}`}
				accessibilityHint={mine ? 'Opens it' : `Drafts a follow-up to ${item.who} in chat`}
				onPress={() => {
					playHaptic('selection');
					main?.();
				}}
				style={({ pressed }) => [
					styles.main,
					pressed && { backgroundColor: withAlpha(colors.muted, 0.7) }
				]}
			>
				<View style={styles.text}>
					<Text
						numberOfLines={1}
						maxFontSizeMultiplier={1.4}
						style={[
							styles.who,
							{ color: mine ? colors.accent : colors.mutedForeground }
						]}
					>
						{item.who}
					</Text>
					<Text
						maxFontSizeMultiplier={1.6}
						style={[
							styles.what,
							settled
								? {
										color: colors.mutedForeground,
										textDecorationLine: 'line-through'
									}
								: { color: colors.foreground }
						]}
					>
						{item.what}
					</Text>
					{settled ? (
						<Text style={[typeScale.small, { color: colors.mutedForeground }]}>
							{settled === 'resolved' ? 'Marked done' : 'Removed'}
						</Text>
					) : meta ? (
						<Text
							numberOfLines={1}
							maxFontSizeMultiplier={1.4}
							style={[typeScale.small, { color: colors.mutedForeground }]}
						>
							{meta}
						</Text>
					) : null}
				</View>
				{!settled && main ? (
					mine ? (
						<ChevronRight size={16} strokeWidth={2} color={colors.mutedForeground} />
					) : (
						<Send size={15} strokeWidth={2} color={colors.mutedForeground} />
					)
				) : null}
			</Pressable>
			<View style={styles.actions}>
				{settled ? (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={`Undo: ${item.what}`}
						hitSlop={hitSlopFor(32, 32)}
						onPress={() => {
							playHaptic('light');
							onUndo(item);
						}}
						style={styles.undo}
					>
						<Undo2 size={14} strokeWidth={2} color={colors.mutedForeground} />
						<MicroLabel>Undo</MicroLabel>
					</Pressable>
				) : (
					<>
						<RowAction
							icon={Check}
							label={mine ? `Done: ${item.what}` : `${item.who} came through`}
							onPress={() => onSettle(item, 'resolved')}
							success
						/>
						<RowAction
							icon={X}
							label={`Not a real ask, remove: ${item.what}`}
							onPress={() => onSettle(item, 'dismissed')}
						/>
					</>
				)}
			</View>
		</View>
	);
}

function RowAction({
	icon: Glyph,
	label,
	onPress,
	success = false
}: {
	icon: Icon;
	label: string;
	onPress: () => void;
	success?: boolean;
}) {
	const { colors } = useInk();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={hitSlopFor(32, 32)}
			onPress={() => {
				playHaptic(success ? 'success' : 'light');
				onPress();
			}}
			style={({ pressed }) => [
				styles.action,
				{
					borderColor: colors.border,
					backgroundColor: pressed ? colors.muted : colors.card
				}
			]}
		>
			<Glyph size={15} strokeWidth={2.25} color={colors.mutedForeground} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	gap: { marginTop: 14 },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		borderBottomWidth: 1
	},
	main: {
		flex: 1,
		minWidth: 0,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		minHeight: 52,
		paddingVertical: 8,
		paddingHorizontal: 4,
		borderRadius: 8
	},
	who: { fontSize: 12.5, lineHeight: 16, fontWeight: '600' },
	text: { flex: 1, minWidth: 0, gap: 2 },
	what: { fontSize: 15, lineHeight: 20 },
	actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	action: {
		width: 32,
		height: 32,
		borderRadius: 8,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center'
	},
	undo: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 5,
		minHeight: 32,
		paddingHorizontal: 4
	}
});
