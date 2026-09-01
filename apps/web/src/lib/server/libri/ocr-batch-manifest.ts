import { createHash } from 'node:crypto';

export type OcrBatchManifestItem = {
	stepId: string;
	imageId: string;
	position: number;
	expectedOcrVersion: number;
	imageContentSha256: string;
};

export function hashOcrBatchManifest(input: {
	runId: string;
	libraryId: string;
	bookId: string;
	items: readonly OcrBatchManifestItem[];
}): string {
	const canonicalManifest = JSON.stringify({
		version: 1,
		runId: input.runId,
		libraryId: input.libraryId,
		bookId: input.bookId,
		items: input.items.map((item) => ({
			stepId: item.stepId,
			imageId: item.imageId,
			position: item.position,
			expectedOcrVersion: item.expectedOcrVersion,
			imageContentSha256: item.imageContentSha256
		}))
	});

	return createHash('sha256').update(canonicalManifest, 'utf8').digest('hex');
}
