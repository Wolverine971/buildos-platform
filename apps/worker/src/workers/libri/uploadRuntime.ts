import type { LibriUploadRuntimeConfig } from '../../config/libriWorkerProfile';
import { LibriUploadConsumer } from './uploadConsumer';
import type { createLibriUploadProcessing } from './uploadProcessing';
import { createLibriUploadDownloadAuthorizer } from './uploadDownloadAuthorizer';
import { createLibriUploadImageDownloader } from './uploadImageDownload';
import { createLibriUploadImageVerifier } from './uploadImageVerifier';
import { createLibriUploadPublicationTransport } from './uploadPublicationTransport';

export function createLibriUploadConsumer(
	config: LibriUploadRuntimeConfig,
	processing: ReturnType<typeof createLibriUploadProcessing>
) {
	const storageOrigin = 'https://iwifjtlebphefldmwbkh.supabase.co';
	const verifier = createLibriUploadImageVerifier();
	return new LibriUploadConsumer({
		scope: {
			libraryId: config.libraryId,
			uploadId: config.uploadId,
			leaseToken: config.leaseToken
		},
		expiresAtMs: config.expiresAtMs,
		processing,
		verifier,
		downloader: createLibriUploadImageDownloader({
			storageOrigin,
			verifier,
			authorize: createLibriUploadDownloadAuthorizer({
				endpointUrl: config.downloadBrokerUrl,
				storageOrigin,
				bearerToken: config.brokerToken
			})
		}),
		publisher: createLibriUploadPublicationTransport({
			endpointUrl: config.publicationBrokerUrl,
			bearerToken: config.brokerToken
		})
	});
}
