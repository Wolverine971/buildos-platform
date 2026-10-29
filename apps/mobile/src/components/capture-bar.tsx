// apps/mobile/src/components/capture-bar.tsx
import * as Haptics from 'expo-haptics';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { AppText } from '@/components/text';
import { useCaptureQueue } from '@/hooks/use-capture-queue';
import { useKeyboardOverlap } from '@/hooks/use-keyboard-inset';
import { LEVEL_SAMPLES, useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { formatDuration, MAX_RECORDING_SECONDS } from '@/lib/capture-audio';
import type { CaptureStage, SortedCapture } from '@/lib/capture-queue';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';
import { radius, spacing } from '@/theme';

/** The server's limit for one capture (CAPTURE_TEXT_MAX in the web's workspace model). */
const CAPTURE_TEXT_MAX = 20_000;

const STAGE_LABEL: Record<CaptureStage, string> = {
	transcribe: 'Transcribing your voice note…',
	save: 'Saving…',
	sort: 'Sorting…'
};

/** A sorted result stays up this long unless the person acts on it. */
const RESULT_MS = 12_000;
const WARN_AT_MS = (MAX_RECORDING_SECONDS - 60) * 1000;

/**
 * Capture, pinned to the bottom of Today in thumb reach. Type and tap send, or tap the mic
 * and talk. Either way the capture is saved on this phone first, then lands in the Workspace
 * and is sorted like the web capture box; the line above the bar says what it became, with
 * Undo.
 */
export function CaptureBar({ inTabs = false }: { inTabs?: boolean }) {
	const colors = useTheme();
	const insets = useSafeAreaInsets();
	const barRef = useRef<ComponentRef<typeof View>>(null);
	const keyboard = useKeyboardOverlap(barRef);
	const { enqueueText, enqueueVoice, active, stopped, sorted, undo, dismissSorted } =
		useCaptureQueue();
	const { session } = useAuth();
	const voice = useVoiceRecorder(session?.user.id ?? null, enqueueVoice);
	const [text, setText] = useState('');
	const [error, setError] = useState<string | null>(null);
	/** A second tap while the first save is still writing to the keychain must not save twice. */
	const sending = useRef(false);

	const recording = voice.phase === 'recording' || voice.phase === 'stopping';
	const hasText = text.trim().length > 0;

	const send = async () => {
		const value = text.trim();
		if (!value || sending.current) return;
		sending.current = true;
		setError(null);
		setText('');
		try {
			await enqueueText(value);
			void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
		} catch (cause) {
			// Not saved: give the words back so nothing typed is lost.
			setText((current) => (current ? current : value));
			setError(cause instanceof Error ? cause.message : 'Could not save that.');
		} finally {
			sending.current = false;
		}
	};

	const message = error ?? voice.error;

	return (
		<View
			ref={barRef}
			style={{
				borderTopWidth: 1,
				borderTopColor: colors.border,
				backgroundColor: colors.bench,
				paddingHorizontal: spacing.md,
				paddingTop: spacing.sm,
				// Above a tab bar the tab bar owns the home-indicator area.
				paddingBottom:
					keyboard > 0 || inTabs ? spacing.sm : Math.max(insets.bottom, spacing.sm),
				marginBottom: keyboard,
				gap: spacing.sm
			}}
		>
			{message ? (
				<StatusLine
					tone="error"
					text={message}
					onDismiss={() => {
						setError(null);
						voice.clearError();
					}}
				/>
			) : (
				<CaptureStatus
					active={active?.stage ?? null}
					waiting={stopped !== null}
					sorted={sorted}
					undo={undo}
					dismiss={dismissSorted}
				/>
			)}

			{recording ? (
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
					<IconButton
						symbol="xmark"
						fallback="✕"
						label="Discard recording"
						variant="ghost"
						disabled={voice.phase === 'stopping'}
						onPress={() => void voice.cancel()}
					/>
					<View
						style={{
							flex: 1,
							height: 44,
							flexDirection: 'row',
							alignItems: 'center',
							gap: spacing.sm,
							paddingHorizontal: spacing.md,
							borderRadius: 22,
							borderWidth: 1,
							borderColor: colors.destructive,
							backgroundColor: colors.card
						}}
						accessibilityLiveRegion="polite"
						accessibilityLabel={`Recording, ${formatDuration(voice.elapsedMs)}`}
					>
						<RecordingDot />
						<AppText
							style={{
								fontVariant: ['tabular-nums'],
								color:
									voice.elapsedMs >= WARN_AT_MS
										? colors.warning
										: colors.foreground
							}}
						>
							{formatDuration(voice.elapsedMs)}
						</AppText>
						<Waveform levels={voice.levels} />
					</View>
					<IconButton
						symbol="stop.fill"
						fallback="■"
						label="Stop and save voice note"
						disabled={voice.phase === 'stopping'}
						onPress={() => void voice.stop()}
					/>
				</View>
			) : (
				<View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
					<TextInput
						accessibilityLabel="Jot a note, task or update"
						value={text}
						onChangeText={setText}
						placeholder="Jot anything…"
						maxLength={CAPTURE_TEXT_MAX}
						placeholderTextColor={colors.mutedForeground}
						multiline
						textAlignVertical="center"
						style={{
							flex: 1,
							minHeight: 44,
							maxHeight: 132,
							paddingHorizontal: spacing.md,
							paddingTop: 11,
							paddingBottom: 11,
							fontSize: 17,
							lineHeight: 22,
							color: colors.foreground,
							backgroundColor: colors.card,
							borderColor: colors.borderStrong,
							borderWidth: 1,
							borderRadius: 22
						}}
					/>
					{hasText ? (
						<IconButton
							symbol="arrow.up"
							fallback="↑"
							label="Save to your Workspace"
							onPress={() => void send()}
						/>
					) : (
						<IconButton
							symbol="mic.fill"
							fallback="●"
							label="Record a voice note"
							disabled={voice.phase === 'starting'}
							onPress={() => void voice.start()}
						/>
					)}
				</View>
			)}

			{voice.phase === 'recording' && voice.elapsedMs >= WARN_AT_MS ? (
				<AppText variant="muted" style={{ textAlign: 'center' }}>
					Stops and saves at {formatDuration(MAX_RECORDING_SECONDS * 1000)}
				</AppText>
			) : null}
		</View>
	);
}

/** What the latest capture is doing, or what it became, with Undo. */
function CaptureStatus({
	active,
	waiting,
	sorted,
	undo,
	dismiss
}: {
	active: CaptureStage | null;
	waiting: boolean;
	sorted: readonly SortedCapture[];
	undo: (entry: SortedCapture) => Promise<{ failed: number }>;
	dismiss: (id: string) => void;
}) {
	const colors = useTheme();
	const latest = sorted[0];
	const [undoState, setUndoState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

	useEffect(() => {
		// A new result replaces the last undo message; the one just undone leaving does not.
		if (!latest) return;
		setUndoState('idle');
		const timer = setTimeout(() => dismiss(latest.id), RESULT_MS);
		return () => clearTimeout(timer);
		// Only a new result restarts the clock.
	}, [latest?.id]);

	useEffect(() => {
		if (undoState !== 'done' && undoState !== 'error') return;
		const timer = setTimeout(() => setUndoState('idle'), 3_000);
		return () => clearTimeout(timer);
	}, [undoState]);

	if (undoState === 'done')
		return <StatusLine tone="success" text="Back the way you wrote it." />;
	if (undoState === 'error') return <StatusLine tone="error" text="Could not undo that." />;

	if (latest) {
		return (
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: spacing.sm,
					paddingHorizontal: spacing.md,
					paddingVertical: spacing.sm,
					borderRadius: radius.md,
					borderWidth: 1,
					borderColor: colors.border,
					backgroundColor: colors.card
				}}
			>
				<AppText style={{ flex: 1 }} numberOfLines={2}>
					<AppText style={{ color: colors.success }}>✓ </AppText>
					{summarize(latest.lines)}
				</AppText>
				{latest.receipt ? (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Undo the sort"
						disabled={undoState === 'busy'}
						hitSlop={8}
						onPress={() => {
							setUndoState('busy');
							undo(latest)
								.then(({ failed }) => setUndoState(failed ? 'error' : 'done'))
								.catch(() => setUndoState('error'));
						}}
					>
						{undoState === 'busy' ? (
							<ActivityIndicator color={colors.accent} />
						) : (
							<AppText
								variant="heading"
								style={{ color: colors.accent, fontSize: 16 }}
							>
								Undo
							</AppText>
						)}
					</Pressable>
				) : null}
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Dismiss"
					hitSlop={8}
					onPress={() => dismiss(latest.id)}
				>
					<AppText variant="muted">✕</AppText>
				</Pressable>
			</View>
		);
	}

	if (active && !waiting) {
		return (
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: spacing.sm,
					paddingHorizontal: spacing.xs
				}}
			>
				<ActivityIndicator size="small" color={colors.accent} />
				<AppText variant="muted">{STAGE_LABEL[active]}</AppText>
			</View>
		);
	}

	return null;
}

function StatusLine({
	tone,
	text,
	onDismiss
}: {
	tone: 'error' | 'success';
	text: string;
	onDismiss?: () => void;
}) {
	const colors = useTheme();
	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: spacing.sm,
				paddingHorizontal: spacing.xs
			}}
		>
			<AppText
				variant={tone === 'error' ? 'error' : 'muted'}
				style={[{ flex: 1 }, tone === 'success' ? { color: colors.success } : null]}
			>
				{text}
			</AppText>
			{onDismiss ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Dismiss"
					hitSlop={8}
					onPress={onDismiss}
				>
					<AppText variant="muted">✕</AppText>
				</Pressable>
			) : null}
		</View>
	);
}

function summarize(lines: string[]): string {
	const shown = lines.slice(0, 2).join(' · ');
	return lines.length > 2 ? `${shown} · +${lines.length - 2} more` : shown;
}

function RecordingDot() {
	const colors = useTheme();
	const opacity = useRef(new Animated.Value(1)).current;
	useEffect(() => {
		const pulse = Animated.loop(
			Animated.sequence([
				Animated.timing(opacity, {
					toValue: 0.25,
					duration: 600,
					easing: Easing.inOut(Easing.ease),
					useNativeDriver: true
				}),
				Animated.timing(opacity, {
					toValue: 1,
					duration: 600,
					easing: Easing.inOut(Easing.ease),
					useNativeDriver: true
				})
			])
		);
		pulse.start();
		return () => pulse.stop();
	}, [opacity]);
	return (
		<Animated.View
			style={{
				width: 10,
				height: 10,
				borderRadius: 5,
				backgroundColor: colors.destructive,
				opacity
			}}
		/>
	);
}

/** The last few seconds of input level, newest on the right. */
function Waveform({ levels }: { levels: number[] }) {
	const colors = useTheme();
	const padded = [...Array(Math.max(0, LEVEL_SAMPLES - levels.length)).fill(0), ...levels];
	return (
		<View
			style={{
				flex: 1,
				height: 24,
				flexDirection: 'row',
				alignItems: 'center',
				justifyContent: 'flex-end',
				gap: 2,
				overflow: 'hidden'
			}}
			importantForAccessibility="no-hide-descendants"
		>
			{padded.map((level, index) => (
				<View
					key={index}
					style={{
						width: 3,
						height: 3 + level * 21,
						borderRadius: 1.5,
						backgroundColor: level > 0.02 ? colors.accent : colors.border
					}}
				/>
			))}
		</View>
	);
}
