// apps/web/src/lib/voice/live-draft.ts
//
// Browser speech recognition (Web Speech API) used only as an instant, rough
// draft of what the user is saying. Server transcription replaces it segment
// by segment. It restarts itself across the pauses where browsers end a
// recognition session, and gives up quietly when the browser refuses.

/// <reference types="dom-speech-recognition" />

type RecognitionCtor = new () => SpeechRecognition;

export interface LiveDraftEvents {
	onChange: (text: { finalText: string; interimText: string }) => void;
	/** The browser refused or broke recognition; the draft is unavailable for this recording. */
	onUnavailable?: (reason: string) => void;
}

const FATAL_ERRORS = new Set([
	'not-allowed',
	'service-not-allowed',
	'audio-capture',
	'network',
	'language-not-supported'
]);
const RESTART_DELAY_MS = 120;
const MAX_RESTARTS_PER_WINDOW = 8;
const RESTART_WINDOW_MS = 15_000;

export function getRecognitionCtor(): RecognitionCtor | null {
	if (typeof window === 'undefined') return null;
	const w = window as unknown as {
		SpeechRecognition?: RecognitionCtor;
		webkitSpeechRecognition?: RecognitionCtor;
	};
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function recognitionLanguage(): string {
	if (typeof navigator === 'undefined') return 'en-US';
	return navigator.language || 'en-US';
}

/**
 * Appends a newly finalized recognition chunk. Some Android builds re-send the
 * whole utterance as each new final result; treat a chunk that extends the
 * previous one as a replacement instead of a repeat.
 */
export function appendFinalChunk(
	state: { text: string; lastChunk: string },
	chunk: string
): { text: string; lastChunk: string } {
	const next = chunk.trim();
	if (!next) return state;
	if (
		state.lastChunk &&
		next.startsWith(state.lastChunk) &&
		state.text.endsWith(state.lastChunk)
	) {
		return {
			text: state.text.slice(0, state.text.length - state.lastChunk.length) + next,
			lastChunk: next
		};
	}
	return {
		text: state.text ? `${state.text} ${next}` : next,
		lastChunk: next
	};
}

export class LiveDraft {
	#Ctor: RecognitionCtor | null;
	#events: LiveDraftEvents;
	#recognition: SpeechRecognition | null = null;
	#active = false;
	#available = true;
	#final = { text: '', lastChunk: '' };
	#interim = '';
	#restartTimes: number[] = [];
	#restartTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(events: LiveDraftEvents, Ctor: RecognitionCtor | null = getRecognitionCtor()) {
		this.#Ctor = Ctor;
		this.#events = events;
	}

	get supported(): boolean {
		return this.#Ctor !== null;
	}

	get finalText(): string {
		return this.#final.text;
	}

	get interimText(): string {
		return this.#interim;
	}

	start(): boolean {
		if (!this.#Ctor || this.#active) return false;
		this.#active = true;
		this.#available = true;
		this.#final = { text: '', lastChunk: '' };
		this.#interim = '';
		this.#restartTimes = [];
		return this.#spawn();
	}

	stop(): void {
		this.#active = false;
		if (this.#restartTimer) clearTimeout(this.#restartTimer);
		this.#restartTimer = null;
		const recognition = this.#recognition;
		this.#recognition = null;
		if (!recognition) return;
		recognition.onresult = null;
		recognition.onend = null;
		recognition.onerror = null;
		try {
			recognition.abort();
		} catch {
			// Already stopped.
		}
	}

	#giveUp(reason: string) {
		if (!this.#available) return;
		this.#available = false;
		this.stop();
		this.#events.onUnavailable?.(reason);
	}

	#spawn(): boolean {
		if (!this.#Ctor || !this.#active) return false;
		let recognition: SpeechRecognition;
		try {
			recognition = new this.#Ctor();
			recognition.continuous = true;
			recognition.interimResults = true;
			recognition.lang = recognitionLanguage();
		} catch {
			this.#giveUp('unsupported');
			return false;
		}

		recognition.onresult = (event: SpeechRecognitionEvent) => {
			if (this.#recognition !== recognition) return;
			let interim = '';
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i];
				const transcript = result?.[0]?.transcript ?? '';
				if (!transcript) continue;
				if (result?.isFinal) {
					this.#final = appendFinalChunk(this.#final, transcript);
				} else {
					interim += transcript;
				}
			}
			this.#interim = interim.trim();
			this.#events.onChange({ finalText: this.#final.text, interimText: this.#interim });
		};

		recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
			if (this.#recognition !== recognition) return;
			if (FATAL_ERRORS.has(event.error)) this.#giveUp(event.error);
			// 'no-speech' and 'aborted' fall through to onend, which restarts.
		};

		recognition.onend = () => {
			if (this.#recognition !== recognition || !this.#active) return;
			// Words still in flight when the browser ended the session become final.
			if (this.#interim) {
				this.#final = appendFinalChunk(this.#final, this.#interim);
				this.#interim = '';
				this.#events.onChange({ finalText: this.#final.text, interimText: '' });
			}
			const now = Date.now();
			this.#restartTimes = this.#restartTimes.filter((t) => now - t < RESTART_WINDOW_MS);
			if (this.#restartTimes.length >= MAX_RESTARTS_PER_WINDOW) {
				this.#giveUp('restart-loop');
				return;
			}
			this.#restartTimes.push(now);
			this.#restartTimer = setTimeout(() => {
				this.#restartTimer = null;
				if (this.#active) this.#spawn();
			}, RESTART_DELAY_MS);
		};

		this.#recognition = recognition;
		try {
			recognition.start();
			return true;
		} catch {
			this.#giveUp('start-failed');
			return false;
		}
	}
}
