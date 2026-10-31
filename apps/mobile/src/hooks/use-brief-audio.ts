// apps/mobile/src/hooks/use-brief-audio.ts
import type { DailyBrief } from '@buildos/api-client';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';

type AudioBrief = Pick<DailyBrief, 'id' | 'audio_status' | 'audio_duration_ms'>;

export type BriefAudio = {
	/** The brief has a narration ready to play. */
	available: boolean;
	playing: boolean;
	/** Fetching the signed URL for the first play. */
	loading: boolean;
	error: string | null;
	/** Seconds. */
	elapsed: number;
	/** Seconds; the brief's recorded length until the player knows better. */
	duration: number;
	toggle: () => void;
};

/**
 * The brief's narration: an mp3 in private storage that the server signs a one-hour URL for
 * on request (GET /api/daily-briefs/:id/audio-url), fetched on the first tap, never before.
 * The player belongs to the screen, so leaving it stops the voice; scrolling does not.
 */
export function useBriefAudio(brief: AudioBrief | null | undefined, autoplay = false): BriefAudio {
	const available = brief?.audio_status === 'ready';
	const id = available ? brief.id : null;
	const [source, setSource] = useState<{ id: string; url: string } | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [wantPlay, setWantPlay] = useState(false);
	// Another day's brief: the URL no longer applies, and the player is rebuilt empty.
	const url = source && source.id === id ? source.url : null;
	const player = useAudioPlayer(url ? { uri: url } : null, { updateInterval: 250 });
	const status = useAudioPlayerStatus(player);

	const load = useCallback(async (briefId: string) => {
		setLoading(true);
		setError(null);
		try {
			const signed = await api.briefs.audioUrl(briefId);
			setSource({ id: briefId, url: signed.url });
		} catch (cause) {
			setWantPlay(false);
			setError(cause instanceof Error ? cause.message : 'Could not load the audio.');
		} finally {
			setLoading(false);
		}
	}, []);

	// The player for the wanted URL exists: start it (it buffers and begins when ready).
	useEffect(() => {
		if (!wantPlay || !url) return;
		let cancelled = false;
		void (async () => {
			try {
				await setAudioModeAsync({ playsInSilentMode: true });
				if (!cancelled) player.play();
			} catch (cause) {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : 'Could not play the audio.');
				}
			} finally {
				if (!cancelled) setWantPlay(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [wantPlay, url, player]);

	// Opened from the card's Listen chip: start once, for the brief it was opened on.
	const autoplayed = useRef(false);
	useEffect(() => {
		if (!autoplay || !id || autoplayed.current) return;
		autoplayed.current = true;
		setWantPlay(true);
		void load(id);
	}, [autoplay, id, load]);

	// Leaving the screen stops the voice (the hook also releases the player right after).
	useEffect(
		() => () => {
			try {
				player.pause();
			} catch {
				// Already released.
			}
		},
		[player]
	);

	const toggle = useCallback(() => {
		if (!id) return;
		if (status.playing) {
			player.pause();
			return;
		}
		if (!url) {
			setWantPlay(true);
			if (!loading) void load(id);
			return;
		}
		void (async () => {
			try {
				const ended =
					status.didJustFinish ||
					(status.duration > 0 && status.currentTime >= status.duration - 0.3);
				if (ended) await player.seekTo(0);
				await setAudioModeAsync({ playsInSilentMode: true });
				player.play();
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'Could not play the audio.');
			}
		})();
	}, [id, url, loading, load, player, status]);

	const duration = status.duration > 0 ? status.duration : (brief?.audio_duration_ms ?? 0) / 1000;
	return {
		available,
		playing: status.playing,
		loading: loading || (wantPlay && !status.playing),
		error,
		elapsed: Math.min(status.currentTime || 0, duration || Number.POSITIVE_INFINITY),
		duration,
		toggle
	};
}
