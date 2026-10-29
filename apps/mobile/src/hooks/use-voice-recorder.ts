// apps/mobile/src/hooks/use-voice-recorder.ts
import {
	requestRecordingPermissionsAsync,
	setAudioModeAsync,
	useAudioRecorder,
	useAudioRecorderState
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
	CAPTURE_RECORDING,
	deleteRecording,
	MAX_RECORDING_SECONDS,
	MIN_RECORDING_MS,
	recordingFileName,
	recordingFromUri
} from '@/lib/capture-audio';
import type { CaptureAudio } from '@/lib/capture-queue';

export type VoicePhase = 'idle' | 'starting' | 'recording' | 'stopping';

/** How many level samples the live waveform shows. */
export const LEVEL_SAMPLES = 32;

/** Metering is dBFS (about -160 to 0). Speech sits around -50 to -10; map that to 0–1. */
export function levelFromMetering(db: number | undefined): number {
	if (db === undefined || !Number.isFinite(db)) return 0;
	return Math.min(1, Math.max(0, (db + 55) / 45));
}

/**
 * One tap to talk, one tap to keep it. The recording goes straight into the documents folder
 * and is handed to `onRecorded` as a queue-ready `CaptureAudio`. It stops itself at ten
 * minutes, and when a call, Siri or a trip to the background interrupts it, what was said so
 * far is kept rather than lost.
 */
export function useVoiceRecorder(
	/** Whose recording this is; names the file so a leftover one is sent by the right account. */
	userId: string | null,
	onRecorded: (audio: CaptureAudio) => Promise<unknown> | void
) {
	const [phase, setPhase] = useState<VoicePhase>('idle');
	const [error, setError] = useState<string | null>(null);
	const [levels, setLevels] = useState<number[]>([]);

	const phaseRef = useRef<VoicePhase>('idle');
	const durationRef = useRef(0);
	/** The file this recording writes to, captured at start: after an audio-system reset the
	 * recorder prepares a fresh empty file, and `recorder.uri` would point there instead. */
	const fileRef = useRef<string | null>(null);
	const onRecordedRef = useRef(onRecorded);
	onRecordedRef.current = onRecorded;
	const finishRef = useRef<(keep: boolean) => Promise<void>>(async () => {});

	const move = (next: VoicePhase) => {
		phaseRef.current = next;
		setPhase(next);
	};

	const recorder = useAudioRecorder(CAPTURE_RECORDING, (status) => {
		// The recorder stopped on its own: the ten-minute limit or an interruption.
		if ((status.isFinished || status.hasError) && phaseRef.current === 'recording') {
			void finishRef.current(true);
		}
	});
	const state = useAudioRecorderState(recorder, 100);

	useEffect(() => {
		if (phase !== 'recording') return;
		durationRef.current = Math.max(durationRef.current, state.durationMillis);
		const level = levelFromMetering(state.metering);
		setLevels((previous) => [...previous.slice(-(LEVEL_SAMPLES - 1)), level]);
	}, [phase, state.durationMillis, state.metering]);

	const finish = useCallback(
		async (keep: boolean) => {
			if (phaseRef.current !== 'recording') return;
			move('stopping');
			const durationMs = Math.max(durationRef.current, recorder.getStatus().durationMillis);
			try {
				await recorder.stop();
			} catch {
				// Already stopped by the system; the file is still there.
			}
			const uri = fileRef.current ?? recorder.uri;
			fileRef.current = null;
			await setAudioModeAsync({ allowsRecording: false }).catch(() => {});

			try {
				if (!uri) {
					if (keep) setError('The recording could not be saved.');
				} else if (!keep) {
					deleteRecording(uri);
				} else if (durationMs < MIN_RECORDING_MS) {
					deleteRecording(uri);
					setError('Too short to keep. Tap the mic and talk.');
				} else {
					await onRecordedRef.current(recordingFromUri(uri, durationMs));
					void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
						() => {}
					);
				}
			} catch (cause) {
				setError(
					cause instanceof Error ? cause.message : 'The recording could not be saved.'
				);
			} finally {
				durationRef.current = 0;
				setLevels([]);
				move('idle');
			}
		},
		[recorder]
	);
	finishRef.current = finish;

	const start = useCallback(async () => {
		if (phaseRef.current !== 'idle') return;
		setError(null);
		move('starting');
		try {
			const permission = await requestRecordingPermissionsAsync();
			if (!permission.granted) {
				setError(
					permission.canAskAgain
						? 'BuildOS needs the microphone to record a voice note.'
						: 'Microphone access is off. Turn it on in Settings to record.'
				);
				move('idle');
				return;
			}
			await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
			await recorder.prepareToRecordAsync(
				userId ? { fileName: recordingFileName(userId) } : undefined
			);
			fileRef.current = recorder.uri;
			durationRef.current = 0;
			setLevels([]);
			recorder.record({ forDuration: MAX_RECORDING_SECONDS });
			move('recording');
			void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
		} catch (cause) {
			await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
			setError(
				cause instanceof Error
					? `Could not start recording: ${cause.message}`
					: 'Could not start recording.'
			);
			move('idle');
		}
	}, [recorder, userId]);

	// Signed out or the screen closed mid-recording: stop, and leave the file where it is. It
	// carries the account in its name, so the next time that account opens the app, the queue
	// finds it and sends it.
	useEffect(
		() => () => {
			if (phaseRef.current !== 'recording') return;
			phaseRef.current = 'idle';
			try {
				// The native recorder may already be released (which also ends the recording).
				recorder.stop().catch(() => {});
			} catch {
				// Released: nothing left to stop.
			}
		},
		[recorder]
	);

	// Leaving the app mid-sentence keeps what was said.
	useEffect(() => {
		const subscription = AppState.addEventListener('change', (next) => {
			// `inactive` (Control Center, a notification pulled down) is not leaving.
			if (next === 'background' && phaseRef.current === 'recording') {
				void finishRef.current(true);
			}
		});
		return () => subscription.remove();
	}, []);

	return {
		phase,
		/** Live while recording, in milliseconds. */
		elapsedMs:
			phase === 'recording'
				? state.durationMillis
				: phase === 'stopping'
					? durationRef.current
					: 0,
		/** Recent input levels, 0–1, oldest first. */
		levels,
		error,
		clearError: () => setError(null),
		start,
		/** Stop and keep the recording. */
		stop: () => finish(true),
		/** Stop and throw the recording away. */
		cancel: () => finish(false)
	};
}
