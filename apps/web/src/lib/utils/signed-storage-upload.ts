// apps/web/src/lib/utils/signed-storage-upload.ts
import { supabase as browserSupabase } from '$lib/supabase';

type SignedStorageUploadTarget = {
	signed_url?: string | null;
	signedUrl?: string | null;
	path?: string | null;
	token?: string | null;
};

type SignedStorageUploadParams = {
	bucket: string;
	upload: SignedStorageUploadTarget;
	file: File;
	contentType?: string;
};

function readTrimmedString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseSignedUploadTarget(upload: SignedStorageUploadTarget, bucket: string) {
	let path = readTrimmedString(upload.path);
	let token = readTrimmedString(upload.token);
	const signedUrl = readTrimmedString(upload.signed_url) ?? readTrimmedString(upload.signedUrl);

	if ((!path || !token) && signedUrl) {
		try {
			const url = new URL(signedUrl);
			token ??= readTrimmedString(url.searchParams.get('token'));

			const marker = '/object/upload/sign/';
			const markerIndex = url.pathname.indexOf(marker);
			if (!path && markerIndex >= 0) {
				const signedFullPath = decodeURIComponent(
					url.pathname.slice(markerIndex + marker.length).replace(/^\/+/, '')
				);
				const bucketPrefix = `${bucket}/`;
				path = signedFullPath.startsWith(bucketPrefix)
					? signedFullPath.slice(bucketPrefix.length)
					: signedFullPath.split('/').slice(1).join('/');
			}
		} catch {
			// The explicit path/token validation below reports a useful upload error.
		}
	}

	return { path, token };
}

export async function uploadFileToSignedStorageUrl({
	bucket,
	upload,
	file,
	contentType
}: SignedStorageUploadParams): Promise<void> {
	if (!browserSupabase) {
		throw new Error('Storage client unavailable');
	}

	const { path, token } = parseSignedUploadTarget(upload, bucket);
	if (!path || !token) {
		throw new Error('Upload metadata missing from server response');
	}

	const { error } = await browserSupabase.storage
		.from(bucket)
		.uploadToSignedUrl(path, token, file, {
			cacheControl: '3600',
			contentType: contentType || file.type || 'application/octet-stream',
			upsert: false
		});

	if (error) {
		throw new Error(error.message || 'Storage upload failed');
	}
}
