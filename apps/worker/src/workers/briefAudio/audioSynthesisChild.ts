// apps/worker/src/workers/briefAudio/audioSynthesisChild.ts
import { synthesizeBriefAudio } from '../../lib/tts/kokoro';

type SynthesisRequest = {
	text?: unknown;
};

type SynthesisResponse =
	| {
			ok: true;
			result: {
				mp3Base64: string;
				durationMs: number | null;
				generationMs: number;
				sampleRate: number | null;
				model: string;
				voice: string;
			};
	  }
	| {
			ok: false;
			error: string;
			stack?: string;
	  };

function sendResponse(response: SynthesisResponse): void {
	if (process.send) {
		process.send(response);
	}
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function handleMessage(message: unknown): Promise<void> {
	try {
		const request = message as SynthesisRequest;
		if (!request || typeof request.text !== 'string' || request.text.trim().length === 0) {
			throw new Error('Audio synthesis child received empty text');
		}

		const result = await synthesizeBriefAudio(request.text);
		sendResponse({
			ok: true,
			result: {
				mp3Base64: result.mp3.toString('base64'),
				durationMs: result.durationMs,
				generationMs: result.generationMs,
				sampleRate: result.sampleRate,
				model: result.model,
				voice: result.voice
			}
		});
		process.exit(0);
	} catch (error) {
		sendResponse({
			ok: false,
			error: getErrorMessage(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		process.exit(1);
	}
}

process.once('message', (message: unknown) => {
	void handleMessage(message);
});

process.once('disconnect', () => {
	process.exit(1);
});
