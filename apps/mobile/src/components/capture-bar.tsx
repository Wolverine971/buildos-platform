// apps/mobile/src/components/capture-bar.tsx
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { type ComponentRef, memo, useCallback, useEffect, useRef, useState } from 'react';
import {
	Animated,
	Easing,
	LayoutAnimation,
	StyleSheet,
	Text,
	TextInput,
	useWindowDimensions,
	View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
	AlertTriangle,
	BoltSpinner,
	Check,
	GraphPaper,
	type IconProps,
	Mic,
	RoundKey,
	Send,
	Square,
	Stamp,
	X
} from '@/components/kit';
import { InlineAction } from '@/components/pending-captures';
import { useAnnounce, useScreenReader } from '@/hooks/use-announce';
import { useCaptureQueue } from '@/hooks/use-capture-queue';
import { useKeyboardOverlap } from '@/hooks/use-keyboard-inset';
import { LEVEL_SAMPLES, useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { formatDuration, MAX_RECORDING_SECONDS } from '@/lib/capture-audio';
import type { CaptureStage, SortedCapture } from '@/lib/capture-queue';
import { useAuth } from '@/providers/auth-provider';
import { useInk, useTheme } from '@/providers/theme-provider';
import { radius, typeScale, withAlpha } from '@/theme';

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

const PLACEHOLDER = 'Jot anything: a thought, a task…';
const PLACEHOLDER_SHORT = 'Jot anything…';

// Box geometry (the mockup's `.capbox`): 1pt border + 6pt padding around 44pt keys = 58pt.
const KEY = 44;
const BOX_PAD = 6;
const BOX_PAD_TEXT = 14;
const INPUT_PAD = 4;
/** SF Pro at 16pt sets lines ~19.1pt apart; the box grows to five of them, then scrolls. */
const INPUT_LINE = 19.1;
const INPUT_LINES = 5;
/** How far the sheet fades in above the dock, over the content scrolling under it. */
const FADE = 16;

/** Lucide Square, filled: the website's stop glyph (`fill-current`). */
const StopSquare = memo(function StopSquare(props: IconProps) {
	return <Square {...props} fill={props.color} />;
});

/**
 * Capture, docked above the tab bar in thumb reach: the website's capture box. Type and tap
 * Send, or tap the mic and talk. Either way the capture is saved on this phone first, then
 * lands in the Workspace and is sorted like the web capture box; the line above the box says
 * what it became, with Undo.
 */
export function CaptureBar({ inTabs = false }: { inTabs?: boolean }) {
	const ink = useInk();
	const { colors } = ink;
	const insets = useSafeAreaInsets();
	const { width, fontScale } = useWindowDimensions();
	const barRef = useRef<ComponentRef<typeof View>>(null);
	const { enqueueText, enqueueVoice, active, stopped, sorted, undo, dismissSorted } =
		useCaptureQueue();
	const { session } = useAuth();
	const voice = useVoiceRecorder(session?.user.id ?? null, enqueueVoice);
	const [text, setText] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [focused, setFocused] = useState(false);
	// Only this box's own keyboard lifts it: the Workspace search keeps it docked.
	const keyboard = useKeyboardOverlap(barRef, { active: focused });
	/** A second tap while the first save is still writing to the keychain must not save twice. */
	const sending = useRef(false);

	const recording = voice.phase === 'recording' || voice.phase === 'stopping';
	const stopping = voice.phase === 'stopping';
	const hasText = text.trim().length > 0;

	// The input unmounts while recording, and an unmount sends no blur.
	useEffect(() => {
		if (recording) setFocused(false);
	}, [recording]);

	// Both tabs keep a capture box mounted, each with its own recorder. Leaving this screen
	// (another tab, or the reader opening over it) stops and keeps a recording, so the other
	// box never starts a second one beside it.
	const stopVoice = useRef(voice.stop);
	stopVoice.current = voice.stop;
	useFocusEffect(
		useCallback(
			() => () => {
				void stopVoice.current();
			},
			[]
		)
	);

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

	const changeFocus = (next: boolean) => {
		// The hint folds away (or back) with the keyboard instead of jumping.
		if (text.length === 0) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
		setFocused(next);
	};

	const message = error ?? voice.error;
	// "Type or speak" invites an idle box; once the person is in it, it has done its job.
	const showHint = text.length === 0 && !focused;
	// The full placeholder needs ~232pt at 16pt; the box leaves the width less ~160 for text.
	const placeholder = width - 160 >= 232 * fontScale ? PLACEHOLDER : PLACEHOLDER_SHORT;
	const level = voice.levels[voice.levels.length - 1] ?? 0;

	const borderColor = recording
		? withAlpha(colors.destructive, 0.55)
		: focused
			? withAlpha(colors.accent, 0.7)
			: colors.border;
	const boxShadow = focused
		? `${ink.shadows.inkStrong}, 0 0 0 1px ${withAlpha(colors.accent, 0.3)}`
		: ink.shadows.inkStrong;

	return (
		<View
			ref={barRef}
			style={[
				styles.dock,
				{
					backgroundColor: colors.background,
					// Above a tab bar the tab bar owns the home-indicator area.
					paddingBottom: keyboard > 0 || inTabs ? 8 : Math.max(insets.bottom, 8),
					marginBottom: keyboard
				}
			]}
		>
			<View
				style={[
					styles.fade,
					{
						backgroundImage: `linear-gradient(to bottom, ${withAlpha(colors.background, 0)}, ${colors.background})`
					}
				]}
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
			/>

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

			<View
				style={[
					styles.box,
					recording ? styles.boxRecording : null,
					{ backgroundColor: colors.card, borderColor, boxShadow }
				]}
			>
				<GraphPaper cell={20} radius={radius.tile - 1} />

				{recording ? (
					<>
						<RoundKey
							icon={X}
							tone="muted"
							size={36}
							iconSize={16}
							accessibilityLabel="Discard recording"
							disabled={stopping}
							onPress={() => void voice.cancel()}
						/>
						<View
							style={styles.strip}
							accessible
							accessibilityLiveRegion="polite"
							accessibilityLabel={`Recording, ${formatDuration(voice.elapsedMs)}`}
						>
							<RecordingDot />
							<Stamp
								size={14}
								tone={voice.elapsedMs >= WARN_AT_MS ? 'warning' : 'foreground'}
								style={styles.timer}
							>
								{formatDuration(voice.elapsedMs)}
							</Stamp>
							<Waveform levels={voice.levels} />
						</View>
						<RoundKey
							icon={StopSquare}
							tone="danger"
							iconSize={16}
							ring={voice.phase === 'recording' ? level : 0}
							// The recorder confirms the save with its own success haptic.
							haptic={false}
							accessibilityLabel="Stop and save voice note"
							disabled={stopping}
							onPress={() => void voice.stop()}
						/>
					</>
				) : (
					<>
						<View style={styles.field}>
							<TextInput
								accessibilityLabel="Jot a note, task or update"
								value={text}
								onChangeText={setText}
								onFocus={() => changeFocus(true)}
								onBlur={() => changeFocus(false)}
								placeholder={placeholder}
								maxLength={CAPTURE_TEXT_MAX}
								placeholderTextColor={colors.mutedForeground}
								selectionColor={colors.accent}
								cursorColor={colors.accent}
								multiline
								textAlignVertical="center"
								style={[
									styles.input,
									{
										color: colors.foreground,
										maxHeight:
											2 * INPUT_PAD + INPUT_LINES * INPUT_LINE * fontScale
									}
								]}
							/>
							{showHint ? (
								<Text
									maxFontSizeMultiplier={1.4}
									accessibilityElementsHidden
									importantForAccessibility="no"
									style={[styles.hint, { color: colors.mutedForeground }]}
								>
									Type or speak
								</Text>
							) : null}
						</View>
						<RoundKey
							icon={Send}
							tone={hasText ? 'accent' : 'muted'}
							iconSize={16}
							accessibilityLabel="Save to your Workspace"
							disabled={!hasText}
							// Confirmed by the haptic after the save, not on touch.
							haptic={false}
							onPress={() => void send()}
							// Empty reads as muted already; skip the extra disabled fade.
							style={hasText ? null : styles.solid}
						/>
						<RoundKey
							icon={Mic}
							tone="outline"
							iconSize={20}
							accessibilityLabel="Record a voice note"
							disabled={voice.phase === 'starting'}
							// Recording start has its own haptic.
							haptic={false}
							onPress={() => void voice.start()}
						/>
					</>
				)}
			</View>

			{voice.phase === 'recording' && voice.elapsedMs >= WARN_AT_MS ? (
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.small, styles.warn, { color: colors.mutedForeground }]}
				>
					Stops and saves at {formatDuration(MAX_RECORDING_SECONDS * 1000)}
				</Text>
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
	const screenReader = useScreenReader();

	// Both tabs show this result; it is spoken once.
	useAnnounce(
		latest ? `${summarize(latest.lines)}${latest.receipt ? '. Undo available.' : ''}` : null,
		latest ? `sorted:${latest.id}` : undefined
	);

	useEffect(() => {
		// A new result replaces the last undo message; the one just undone leaving does not.
		if (!latest) return;
		setUndoState('idle');
	}, [latest?.id]);

	useEffect(() => {
		// With VoiceOver on, the result (and its Undo) stays until dismissed: finding it can
		// take longer than the clock.
		if (!latest || screenReader) return;
		const timer = setTimeout(() => dismiss(latest.id), RESULT_MS);
		return () => clearTimeout(timer);
		// Only a new result restarts the clock.
	}, [latest?.id, screenReader]);

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
			<View style={styles.status}>
				<Check size={14} color={colors.success} strokeWidth={2.5} />
				<Text
					numberOfLines={2}
					maxFontSizeMultiplier={1.4}
					style={[typeScale.meta, styles.statusText, { color: colors.mutedForeground }]}
				>
					{summarize(latest.lines)}
				</Text>
				{latest.receipt ? (
					undoState === 'busy' ? (
						<View style={styles.busy}>
							<BoltSpinner size={16} label="Undoing" />
						</View>
					) : (
						<InlineAction
							title="Undo"
							accessibilityLabel="Undo the sort"
							onPress={() => {
								setUndoState('busy');
								undo(latest)
									.then(({ failed }) => setUndoState(failed ? 'error' : 'done'))
									.catch(() => setUndoState('error'));
							}}
						/>
					)
				) : null}
				<InlineAction
					icon={X}
					tone="muted"
					accessibilityLabel="Dismiss"
					onPress={() => dismiss(latest.id)}
				/>
			</View>
		);
	}

	if (active && !waiting) {
		return (
			<View style={styles.status} accessible accessibilityLabel={STAGE_LABEL[active]}>
				<BoltSpinner size={15} label={STAGE_LABEL[active]} />
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.meta, styles.statusText, { color: colors.mutedForeground }]}
				>
					{STAGE_LABEL[active]}
				</Text>
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
	const color = tone === 'error' ? colors.destructive : colors.success;
	const Glyph = tone === 'error' ? AlertTriangle : Check;
	useAnnounce(text);
	return (
		<View style={styles.status} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
			<Glyph size={14} color={color} strokeWidth={2.25} />
			<Text
				maxFontSizeMultiplier={1.4}
				style={[typeScale.meta, styles.statusText, { color }]}
			>
				{text}
			</Text>
			{onDismiss ? (
				<InlineAction icon={X} tone="muted" accessibilityLabel="Dismiss" onPress={onDismiss} />
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
	return <Animated.View style={[styles.dot, { backgroundColor: colors.destructive, opacity }]} />;
}

/**
 * The last few seconds of input level, newest on the right: destructive bars like the web's
 * level meter, louder = taller and stronger. Slots with no sample yet sit as faint stubs.
 */
function Waveform({ levels }: { levels: number[] }) {
	const colors = useTheme();
	const empty = Math.max(0, LEVEL_SAMPLES - levels.length);
	const padded: (number | null)[] = [...Array<null>(empty).fill(null), ...levels];
	return (
		<View
			style={styles.wave}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			{padded.map((level, index) => (
				<View
					key={index}
					style={[
						styles.bar,
						level === null
							? { height: 3, backgroundColor: colors.border }
							: {
									height: 3 + level * 19,
									backgroundColor: colors.destructive,
									opacity: 0.45 + Math.min(1, level) * 0.55
								}
					]}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	dock: { paddingTop: 8, paddingHorizontal: 10, gap: 6 },
	fade: {
		position: 'absolute',
		left: 0,
		right: 0,
		top: -FADE,
		height: FADE,
		pointerEvents: 'none'
	},
	box: {
		minHeight: KEY + 2 * BOX_PAD + 2,
		flexDirection: 'row',
		alignItems: 'flex-end',
		gap: 6,
		paddingVertical: BOX_PAD,
		paddingRight: BOX_PAD,
		paddingLeft: BOX_PAD_TEXT,
		borderRadius: radius.tile,
		borderWidth: 1
	},
	boxRecording: { alignItems: 'center', paddingLeft: BOX_PAD },
	field: { flex: 1, minHeight: KEY, justifyContent: 'center' },
	input: {
		fontSize: 16,
		paddingTop: INPUT_PAD,
		paddingBottom: INPUT_PAD,
		paddingHorizontal: 0
	},
	hint: { fontSize: 11.5, lineHeight: 14, marginTop: 1 },
	solid: { opacity: 1 },
	strip: { flex: 1, height: KEY, flexDirection: 'row', alignItems: 'center', gap: 8 },
	timer: { fontWeight: '600' },
	dot: { width: 8, height: 8, borderRadius: 4 },
	wave: {
		flex: 1,
		height: 22,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'flex-end',
		gap: 2,
		overflow: 'hidden'
	},
	bar: { width: 3, borderRadius: 1.5 },
	status: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		minHeight: 24,
		paddingHorizontal: 6
	},
	statusText: { flex: 1 },
	busy: { width: 40, height: 24, alignItems: 'center', justifyContent: 'center' },
	warn: { textAlign: 'center' }
});
