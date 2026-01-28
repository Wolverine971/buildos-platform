// apps/web/src/lib/services/smart-llm/transcription-utils.ts

export function buildTranscriptionVocabulary(customTerms?: string): string {
	const baseVocabulary = 'BuildOS, brain dump, ontology, daily brief, phase, project context';
	return customTerms ? `${baseVocabulary}, ${customTerms}` : baseVocabulary;
}

export function getAudioFormat(mimeType?: string, filename?: string): string {
	const cleaned = mimeType?.split(';')[0]?.trim().toLowerCase();
	const mapping: Record<string, string> = {
		'audio/webm': 'webm',
		'audio/ogg': 'ogg',
		'audio/wav': 'wav',
		'audio/mp4': 'm4a',
		'audio/mpeg': 'mp3',
		'audio/mp3': 'mp3',
		'audio/flac': 'flac',
		'audio/x-flac': 'flac',
		'audio/aac': 'm4a'
	};

	if (cleaned && mapping[cleaned]) {
		return mapping[cleaned];
	}

	if (filename && filename.includes('.')) {
		const ext = filename.split('.').pop()?.toLowerCase();
		if (ext) {
			return ext === 'mp4' ? 'm4a' : ext;
		}
	}

	return 'webm';
}

export async function encodeAudioToBase64(audioFile: File): Promise<string> {
	const buffer = Buffer.from(await audioFile.arrayBuffer());
	return buffer.toString('base64');
}

export function isRetryableTranscriptionError(error: any): boolean {
	if (error?.name === 'TranscriptionTimeoutError') {
		return true;
	}

	if (
		error?.code === 'ENOTFOUND' ||
		error?.code === 'ETIMEDOUT' ||
		error?.code === 'ECONNRESET'
	) {
		return true;
	}

	const status = error?.status;
	if (status === 429) return true;
	if (status && status >= 500 && status < 600) return true;

	return false;
}

export async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
