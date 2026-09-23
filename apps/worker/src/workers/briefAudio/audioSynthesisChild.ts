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

// Exit only once the IPC write has flushed: exiting right after process.send
// truncates a large payload (the base64 MP3) and the parent sees a dead child.
function sendResponseAndExit(response: SynthesisResponse, exitCode: number): void {
	if (!process.send) {
		process.exit(exitCode);
	}
	process.send(response, (error: Error | null) => process.exit(error ? 1 : exitCode));
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
		sendResponseAndExit(
			{
				ok: true,
				result: {
					mp3Base64: result.mp3.toString('base64'),
					durationMs: result.durationMs,
					generationMs: result.generationMs,
					sampleRate: result.sampleRate,
					model: result.model,
					voice: result.voice
				}
			},
			0
		);
	} catch (error) {
		sendResponseAndExit(
			{
				ok: false,
				error: getErrorMessage(error),
				stack: error instanceof Error ? error.stack : undefined
			},
			1
		);
	}
}

process.once('message', (message: unknown) => {
	void handleMessage(message);
});

process.once('disconnect', () => {
	process.exit(1);
});
