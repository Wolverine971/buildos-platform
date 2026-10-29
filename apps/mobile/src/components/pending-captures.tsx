// apps/mobile/src/components/pending-captures.tsx
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { type Icon, MicroLabel, Stamp, type StampTone } from '@/components/kit';
import { useCaptureQueue } from '@/hooks/use-capture-queue';
import { formatDuration } from '@/lib/capture-audio';
import type { CaptureStage, DrainStop, PendingCapture } from '@/lib/capture-queue';
import { useTheme } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

/** Why pending captures are waiting, by why the last send attempt stopped. */
const REASON: Record<DrainStop, string> = {
	offline: 'No connection, saved on this phone',
	unauthorized: 'Sign in to send',
	server: 'BuildOS unreachable, will retry'
};

/** The waiting row's stamp while a retry is working on a capture. */
const STAGE_STAMP: Record<CaptureStage, string> = {
	transcribe: 'Transcribing…',
	save: 'Sending…',
	sort: 'Sorting…'
};

function describeCapture(item: PendingCapture): string {
	if (item.kind === 'voice' && !item.text) {
		const ms = item.audio?.duration_ms ?? 0;
		// Recordings recovered after the app closed mid-save have no known length.
		return ms > 0 ? `Voice note · ${formatDuration(ms)}` : 'Voice note';
	}
	return item.text;
}

/**
 * The visible "waiting to send" state. Shows while captures wait for a connection (the bar's
 * status line covers ones that are sending now), and lists the ones that need a person:
 * refused by the server, or a recording with no speech in it. Drawn as plain rows on the
 * sheet, like Today's task rows, with a mono stamp for each row's state.
 */
export function PendingCaptures() {
	const colors = useTheme();
	const { pendingCount, failed, stopped, active, retryAll, remove } = useCaptureQueue();

	const waiting = pendingCount > 0 && stopped !== null;
	if (!waiting && failed.length === 0) return null;
	const count = (waiting ? pendingCount : 0) + failed.length;

	return (
		<View>
			<View style={[styles.head, { borderBottomColor: withAlpha(colors.border, 0.7) }]}>
				<MicroLabel accessibilityRole="header" style={styles.headLabel}>
					On this phone · {count}
				</MicroLabel>
				<InlineAction
					title={failed.length ? 'Try again' : 'Send now'}
					onPress={() => void retryAll()}
				/>
			</View>

			{waiting && stopped ? (
				<CaptureRow
					title={
						pendingCount === 1
							? '1 capture waiting to send'
							: `${pendingCount} captures waiting to send`
					}
					meta={REASON[stopped]}
					stamp={active ? STAGE_STAMP[active.stage] : 'Waiting'}
					stampTone={active ? 'accent' : 'warning'}
				/>
			) : null}

			{failed.map((item) => (
				<CaptureRow
					key={item.id}
					title={describeCapture(item)}
					meta={item.last_error ?? 'Could not save'}
					metaTone="destructive"
					stamp="Needs you"
					stampTone="destructive"
				>
					<InlineAction
						title="Discard"
						tone="muted"
						accessibilityLabel="Discard this capture"
						onPress={() => void remove(item.id)}
						style={styles.rowAction}
					/>
				</CaptureRow>
			))}
		</View>
	);
}

function CaptureRow({
	title,
	meta,
	metaTone = 'muted',
	stamp,
	stampTone,
	children
}: {
	title: string;
	meta: string;
	metaTone?: 'muted' | 'destructive';
	stamp: string;
	stampTone: StampTone;
	children?: ReactNode;
}) {
	const colors = useTheme();
	return (
		<View style={styles.row}>
			<View style={styles.rowText}>
				<Text
					numberOfLines={2}
					maxFontSizeMultiplier={1.6}
					style={[typeScale.row, { color: colors.foreground }]}
				>
					{title}
				</Text>
				<Text
					maxFontSizeMultiplier={1.6}
					style={[
						typeScale.meta,
						{
							color:
								metaTone === 'destructive'
									? colors.destructive
									: colors.mutedForeground
						}
					]}
				>
					{meta}
				</Text>
				{children}
			</View>
			<Stamp size={11} tone={stampTone} style={styles.stamp}>
				{stamp}
			</Stamp>
		</View>
	);
}

type InlineActionProps = {
	/** Default 'accent' (Undo, Send now); 'muted' for Discard and dismiss. */
	tone?: 'accent' | 'muted';
	onPress: () => void;
	disabled?: boolean;
	accessibilityHint?: string;
	style?: StyleProp<ViewStyle>;
} & (
	| { title: string; icon?: Icon; accessibilityLabel?: string }
	| { title?: undefined; icon: Icon; accessibilityLabel: string }
);

/**
 * A text (or icon) button that sits inside a line of text: 13/600, no key chrome, with hit
 * slop so the target still reaches 44pt. Used by the capture status line and these rows.
 */
export function InlineAction({
	title,
	icon: Glyph,
	tone = 'accent',
	onPress,
	disabled = false,
	accessibilityLabel,
	accessibilityHint,
	style
}: InlineActionProps) {
	const colors = useTheme();
	const color = tone === 'accent' ? colors.accent : colors.mutedForeground;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel ?? title}
			accessibilityHint={accessibilityHint}
			accessibilityState={{ disabled }}
			disabled={disabled}
			hitSlop={title ? TEXT_SLOP : ICON_SLOP}
			onPress={onPress}
			style={({ pressed }) => [
				styles.action,
				title ? styles.actionText : styles.actionIcon,
				{ opacity: disabled ? 0.4 : pressed ? 0.55 : 1 },
				style
			]}
		>
			{Glyph ? <Glyph size={title ? 14 : 16} color={color} strokeWidth={2.25} /> : null}
			{title ? (
				<Text maxFontSizeMultiplier={1.4} style={[styles.actionLabel, { color }]}>
					{title}
				</Text>
			) : null}
		</Pressable>
	);
}

// Text actions are ~24pt tall and at least ~40 wide; icon actions are 28×28. Both reach 44.
const TEXT_SLOP = { top: 10, bottom: 10, left: 4, right: 4 } as const;
const ICON_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

const styles = StyleSheet.create({
	head: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 12,
		paddingTop: 4,
		paddingBottom: 4,
		marginBottom: 2,
		borderBottomWidth: 1
	},
	headLabel: { flexShrink: 1 },
	row: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 12,
		paddingVertical: 8
	},
	rowText: { flex: 1, gap: 2 },
	rowAction: { alignSelf: 'flex-start', marginLeft: -6, marginTop: 2 },
	// Uppercase and tracked like the web's stamps; VoiceOver still reads the plain word.
	stamp: { marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.8 },
	action: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 4,
		borderRadius: 6
	},
	actionText: { minHeight: 24, paddingHorizontal: 6, paddingVertical: 3 },
	actionIcon: { width: 28, height: 28 },
	actionLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' }
});
