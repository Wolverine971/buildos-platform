// apps/mobile/src/components/inbox/pile-bar.tsx
// The cleared pile, docked at the bottom of the inbox: the last answer with "Undo 4s" while it
// waits, then "Saving…", "Saved", or "1 back on your card". Undo takes back the newest answer
// still waiting; tap again for the one before.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AlertTriangle, BoltSpinner, Check, Key, Undo2 } from '@/components/kit';
import { useAnnounce } from '@/hooks/use-announce';
import { inboxPile, usePile } from '@/lib/inbox/inbox-store';
import { useInk } from '@/providers/theme-provider';
import { typeScale } from '@/theme';

export function PileBar() {
	const ink = useInk();
	const { colors } = ink;
	const entries = usePile();
	const holding = entries.filter((entry) => entry.status === 'holding');
	const saving = entries.filter(
		(entry) => entry.status === 'queued' || entry.status === 'saving'
	);
	const failed = entries.filter((entry) => entry.status === 'failed');
	const done = entries.filter((entry) => entry.status === 'done');
	const latest = holding.at(-1) ?? null;

	// Tick the countdown only while something waits.
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!latest) return;
		const timer = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(timer);
	}, [latest]);

	useAnnounce(failed.length ? `${failed.length} back on your card` : null);

	if (!entries.length) return null;

	const seconds = latest ? Math.max(1, Math.ceil((latest.heldUntil - now) / 1000)) : 0;
	const parts = [
		holding.length + saving.length + done.length > 0
			? `Cleared ${holding.length + saving.length + done.length}`
			: null,
		saving.length ? `${saving.length} saving` : null,
		failed.length ? `${failed.length} back on your card` : null
	].filter(Boolean);

	return (
		<View
			accessibilityLiveRegion="polite"
			style={[
				styles.bar,
				{
					backgroundColor: colors.card,
					borderColor: colors.border,
					boxShadow: ink.shadows.ink
				}
			]}
		>
			<View style={styles.icon}>
				{saving.length ? (
					<BoltSpinner size={14} label="Saving" />
				) : failed.length ? (
					<AlertTriangle size={15} strokeWidth={2.25} color={colors.warning} />
				) : (
					<Check size={15} strokeWidth={2.5} color={colors.success} />
				)}
			</View>
			<View style={styles.text}>
				<Text
					numberOfLines={1}
					style={[typeScale.small, styles.strong, { color: colors.foreground }]}
				>
					{latest ? `${latest.label} · ${latest.title}` : parts.join(' · ') || 'Saved'}
				</Text>
				{latest && parts.length ? (
					<Text
						numberOfLines={1}
						style={[typeScale.small, { color: colors.mutedForeground }]}
					>
						{parts.join(' · ')}
					</Text>
				) : failed[0]?.message ? (
					<Text
						numberOfLines={2}
						style={[typeScale.small, { color: colors.mutedForeground }]}
					>
						{failed[0].message}
					</Text>
				) : null}
			</View>
			{latest ? (
				<Key
					title={`Undo ${seconds}s`}
					icon={Undo2}
					size="xs"
					accessibilityLabel={`Undo: ${latest.label}, ${latest.title}`}
					onPress={() => inboxPile.undoLatest()}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 8,
		minHeight: 52
	},
	icon: { width: 18, alignItems: 'center' },
	text: { flex: 1, minWidth: 0 },
	strong: { fontWeight: '600' }
});
