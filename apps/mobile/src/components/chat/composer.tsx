// apps/mobile/src/components/chat/composer.tsx
// The message box at the bottom of a chat: the capture box's shape (card, graph paper, round
// keys), docked to the screen's bottom edge and riding on top of the keyboard. Type or talk;
// Send keeps the keyboard up, like Messages; while a reply is in flight the key is Stop.
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import {
	Animated,
	Easing,
	StyleSheet,
	Text,
	TextInput,
	useAnimatedValue,
	useWindowDimensions,
	View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
	BoltSpinner,
	GraphPaper,
	Mic,
	playHaptic,
	RoundKey,
	Send,
	Square,
	Stamp,
	X
} from '@/components/kit';
import { useKeyboardOverlap } from '@/hooks/use-keyboard-inset';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { api } from '@/lib/api';
import { deleteRecording, formatDuration, transcribeForm } from '@/lib/capture-audio';
import type { CaptureAudio } from '@/lib/capture-queue';
import { useAuth } from '@/providers/auth-provider';
import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { radius, typeScale, withAlpha } from '@/theme';

// Box geometry, the capture box's: 1pt border + 6pt padding around 44pt keys = 58pt.
const KEY = 44;
const BOX_PAD = 6;
const BOX_PAD_TEXT = 14;
const INPUT_PAD = 4;
/** SF Pro at 16pt sets lines ~19.1pt apart; the box grows to five of them, then scrolls. */
const INPUT_LINE = 19.1;
const INPUT_LINES = 5;
const FADE = 18;

export type ComposerProps = {
	/** A reply is in flight: the Send key becomes Stop. */
	busy: boolean;
	onSend: (text: string) => Promise<void> | void;
	onStop: () => void;
	error: string | null;
	onDismissError: () => void;
	placeholder: string;
	/** Dev screenshots: open the keyboard when this is set; a new value focuses again. */
	autoFocus?: string | null;
};

export function Composer({
	busy,
	onSend,
	onStop,
	error,
	onDismissError,
	placeholder,
	autoFocus = null
}: ComposerProps) {
	const ink = useInk();
	const { colors } = ink;
	const insets = useSafeAreaInsets();
	const { fontScale } = useWindowDimensions();
	const { session } = useAuth();
	const dockRef = useRef<ComponentRef<typeof View>>(null);
	// The chat is a full-screen modal, so the box rests on the screen's bottom edge: the
	// keyboard covers exactly the window below its top, no measuring needed.
	const lift = useKeyboardOverlap(dockRef, { restsOnScreenBottom: true });
	const [text, setText] = useState('');
	const [focused, setFocused] = useState(false);
	const [transcribing, setTranscribing] = useState(false);
	const [voiceError, setVoiceError] = useState<string | null>(null);
	const sending = useRef(false);
	const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
	useEffect(() => {
		if (!autoFocus) return;
		const frame = requestAnimationFrame(() => inputRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, [autoFocus]);

	const voice = useVoiceRecorder(session?.user.id ?? null, async (audio: CaptureAudio) => {
		setTranscribing(true);
		setVoiceError(null);
		try {
			const { transcript } = await api.transcribe(transcribeForm(audio));
			const words = transcript.trim();
			if (!words) setVoiceError('No speech heard.');
			else setText((current) => (current.trim() ? `${current.trimEnd()} ${words}` : words));
		} catch (cause) {
			setVoiceError(cause instanceof Error ? cause.message : "Couldn't transcribe that.");
		} finally {
			deleteRecording(audio);
			setTranscribing(false);
		}
	});
	const recording = voice.phase === 'recording' || voice.phase === 'stopping';
	const hasText = text.trim().length > 0;

	const send = async () => {
		const value = text.trim();
		if (!value || sending.current) return;
		sending.current = true;
		setText('');
		playHaptic('light');
		try {
			await onSend(value);
		} finally {
			sending.current = false;
		}
	};

	const message = error ?? voiceError ?? voice.error;
	const dismiss = () => {
		onDismissError();
		setVoiceError(null);
		voice.clearError();
	};

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
			ref={dockRef}
			style={[
				styles.dock,
				{
					backgroundColor: colors.background,
					// On the keyboard there is no home indicator to clear.
					paddingBottom: lift > 0 ? 8 : Math.max(insets.bottom, 8),
					marginBottom: lift
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
				<View style={styles.status} accessibilityLiveRegion="polite">
					<Text
						maxFontSizeMultiplier={1.4}
						style={[typeScale.meta, styles.statusText, { color: colors.destructive }]}
					>
						{message}
					</Text>
					<RoundKey
						icon={X}
						tone="muted"
						size={28}
						iconSize={14}
						haptic="selection"
						accessibilityLabel="Dismiss"
						onPress={dismiss}
					/>
				</View>
			) : null}
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
							disabled={voice.phase === 'stopping'}
							onPress={() => void voice.cancel()}
						/>
						<View
							style={styles.strip}
							accessible
							accessibilityLiveRegion="polite"
							accessibilityLabel={`Listening, ${formatDuration(voice.elapsedMs)}`}
						>
							<RecordingDot />
							<Stamp size={14} tone="foreground" style={styles.timer}>
								{formatDuration(voice.elapsedMs)}
							</Stamp>
							<Text
								numberOfLines={1}
								maxFontSizeMultiplier={1.3}
								style={[typeScale.meta, { color: colors.mutedForeground }]}
							>
								Listening…
							</Text>
						</View>
						<RoundKey
							icon={Square}
							tone="danger"
							iconSize={16}
							haptic={false}
							accessibilityLabel="Stop recording"
							accessibilityHint="Your words land in the message box"
							disabled={voice.phase === 'stopping'}
							onPress={() => void voice.stop()}
						/>
					</>
				) : (
					<>
						<View style={styles.field}>
							<TextInput
								accessibilityLabel="Message"
								value={text}
								onChangeText={setText}
								onFocus={() => setFocused(true)}
								onBlur={() => setFocused(false)}
								placeholder={placeholder}
								placeholderTextColor={colors.mutedForeground}
								selectionColor={colors.accent}
								cursorColor={colors.accent}
								ref={inputRef}
								multiline
								textAlignVertical="center"
								blurOnSubmit={false}
								style={[
									styles.input,
									{
										color: colors.foreground,
										maxHeight:
											2 * INPUT_PAD + INPUT_LINES * INPUT_LINE * fontScale
									}
								]}
							/>
						</View>
						{transcribing ? (
							<View
								style={styles.spinner}
								accessibilityLabel="Transcribing"
								accessible
							>
								<BoltSpinner size={22} label="" />
							</View>
						) : hasText ? (
							<RoundKey
								icon={Send}
								tone="accent"
								iconSize={16}
								haptic={false}
								accessibilityLabel="Send"
								onPress={() => void send()}
							/>
						) : busy ? (
							<RoundKey
								icon={Square}
								tone="outline"
								iconSize={15}
								accessibilityLabel="Stop the reply"
								onPress={onStop}
							/>
						) : (
							<RoundKey
								icon={Send}
								tone="muted"
								iconSize={16}
								haptic={false}
								accessibilityLabel="Send"
								disabled
								style={styles.solid}
							/>
						)}
						<RoundKey
							icon={Mic}
							tone="outline"
							iconSize={20}
							haptic={false}
							accessibilityLabel="Talk"
							accessibilityHint="Your words land in the message box"
							disabled={voice.phase === 'starting' || transcribing}
							onPress={() => void voice.start()}
						/>
					</>
				)}
			</View>
		</View>
	);
}

/** A breathing destructive dot, the recording light. */
function RecordingDot() {
	const { colors } = useInk();
	const reduceMotion = useReducedMotion();
	const glow = useAnimatedValue(1);
	useEffect(() => {
		if (reduceMotion) return;
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(glow, {
					toValue: 0.25,
					duration: 600,
					easing: Easing.inOut(Easing.ease),
					useNativeDriver: true
				}),
				Animated.timing(glow, {
					toValue: 1,
					duration: 600,
					easing: Easing.inOut(Easing.ease),
					useNativeDriver: true
				})
			])
		);
		loop.start();
		return () => loop.stop();
	}, [glow, reduceMotion]);
	return (
		<Animated.View
			style={[styles.dot, { backgroundColor: colors.destructive, opacity: glow }]}
		/>
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
	status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
	statusText: { flex: 1 },
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
	input: { fontSize: 16, paddingTop: INPUT_PAD, paddingBottom: INPUT_PAD, paddingHorizontal: 0 },
	spinner: { width: KEY, height: KEY, alignItems: 'center', justifyContent: 'center' },
	solid: { opacity: 1 },
	strip: { flex: 1, height: KEY, flexDirection: 'row', alignItems: 'center', gap: 8 },
	timer: { fontWeight: '600' },
	dot: { width: 8, height: 8, borderRadius: 4 }
});
