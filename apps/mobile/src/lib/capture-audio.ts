// apps/mobile/src/lib/capture-audio.ts
import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { resolveStoredPath, toStoredPath } from '@/lib/audio-path';
import { type CaptureAudio, CaptureRejectedError } from '@/lib/capture-queue';

/** A voice capture stops itself here and is saved like a manual stop. */
export const MAX_RECORDING_SECONDS = 10 * 60;
/** Shorter than this is an accidental tap; it is thrown away. */
export const MIN_RECORDING_MS = 800;

/**
 * Speech, not music: 16 kHz mono AAC at 32 kbps is about 4 KB a second, so ten minutes is
 * about 2.4 MB, well under the web host's 4.5 MB request limit, and plenty for transcription.
 * Written straight into the documents folder, which iOS never clears on its own.
 */
export const CAPTURE_RECORDING: RecordingOptions = {
	extension: '.m4a',
	sampleRate: 16_000,
	numberOfChannels: 1,
	bitRate: 32_000,
	isMeteringEnabled: true,
	directory: 'document',
	android: {
		outputFormat: 'mpeg4',
		audioEncoder: 'aac'
	},
	ios: {
		outputFormat: IOSOutputFormat.MPEG4AAC,
		audioQuality: AudioQuality.MEDIUM,
		linearPCMBitDepth: 16,
		linearPCMIsBigEndian: false,
		linearPCMIsFloat: false
	},
	web: {
		mimeType: 'audio/webm',
		bitsPerSecond: 32_000
	}
};

/** `.m4a` is MPEG-4 audio; `/api/transcribe` maps `audio/mp4` to the `m4a` the provider wants. */
export const CAPTURE_MIME_TYPE = 'audio/mp4';

const documentsUri = () => Paths.document.uri;

export function recordingFromUri(uri: string, durationMs: number): CaptureAudio {
	return {
		path: toStoredPath(uri, documentsUri()),
		duration_ms: Math.max(0, Math.round(durationMs)),
		mime_type: CAPTURE_MIME_TYPE
	};
}

export function recordingUri(audio: CaptureAudio): string {
	return resolveStoredPath(audio.path, documentsUri());
}

/** Removes a recording from the phone; a file that is already gone is fine. */
export function deleteRecording(audio: CaptureAudio | string): void {
	const uri = typeof audio === 'string' ? audio : recordingUri(audio);
	const file = new File(uri);
	if (file.exists) file.delete();
}

/**
 * The multipart body for `/api/transcribe`. React Native's FormData streams a file from its
 * URI when given `{ uri, name, type }`; nothing is read into memory here.
 */
export function transcribeForm(audio: CaptureAudio): FormData {
	const uri = recordingUri(audio);
	if (!new File(uri).exists) {
		throw new CaptureRejectedError('The recording is no longer on this phone.');
	}
	const form = new FormData();
	form.append('audio', { uri, name: 'capture.m4a', type: audio.mime_type } as unknown as Blob);
	// Silence comes back as an empty transcript, which the queue shows as "no speech heard".
	form.append('allowEmpty', 'true');
	return form;
}

/**
 * Each recording is named for its account, so recordings left behind (the app closed between
 * stop and save) can be found and sent later by the right person. No path separators allowed.
 */
export function recordingFileName(userId: string, now: number = Date.now()): string {
	return `${userId}-${now.toString(36)}`;
}

/** Smaller than this is a header with no audio (an interrupted start); not worth sending. */
const EMPTY_RECORDING_BYTES = 2_048;

/**
 * Recordings for this account sitting in the recorder's folder. Header-only files are deleted.
 * The queue decides which of the rest no capture points at. A recording whose note was saved
 * but whose file could not be deleted would be found again; that is rare, and a duplicate note
 * beats a lost one.
 */
export function findRecordings(userId: string): CaptureAudio[] {
	try {
		// expo-audio writes to <documents>/ExpoAudio on iOS and <documents>/Audio on Android.
		const folder = new Directory(Paths.document, Platform.OS === 'ios' ? 'ExpoAudio' : 'Audio');
		if (!folder.exists) return [];
		const found: CaptureAudio[] = [];
		for (const entry of folder.list()) {
			if (!(entry instanceof File) || !entry.name.startsWith(`${userId}-`)) continue;
			if (entry.size < EMPTY_RECORDING_BYTES) {
				entry.delete();
				continue;
			}
			found.push(recordingFromUri(entry.uri, 0));
		}
		return found;
	} catch {
		return [];
	}
}

/** `0:42`, `10:00` */
export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
