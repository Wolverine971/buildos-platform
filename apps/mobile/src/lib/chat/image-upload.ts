// apps/mobile/src/lib/chat/image-upload.ts
// Upload one picked image for chat, the website's way: hash the bytes, register the image
// (`POST /api/agent/chat-attachments`), put the bytes at the signed Storage target, and for a
// project chat mark it complete so OCR runs. A reused image (same bytes) skips the upload.
import type { AgentTurnAttachment } from '@buildos/api-client';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

import { imageFileName, type PickedImage, signedTarget, toHex, turnAttachment } from './images';

const DEFAULT_BUCKET = 'onto-assets';

export async function uploadChatImage(
	pick: PickedImage,
	options: { projectId: string | null; order: number }
): Promise<AgentTurnAttachment> {
	const bytes = await new File(pick.uri).bytes();
	const checksum = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
	const contentType = pick.mimeType ?? 'image/jpeg';
	const created = await api.chat.createImageAttachment({
		project_id: options.projectId,
		file_name: imageFileName(pick, options.order),
		content_type: contentType,
		file_size_bytes: bytes.byteLength,
		checksum_sha256: checksum,
		width: pick.width,
		height: pick.height,
		metadata: { source_component: 'mobile_chat_composer' }
	});
	let asset = created.asset;
	if (created.upload) {
		const bucket = asset.storage_bucket ?? DEFAULT_BUCKET;
		const { path, token } = signedTarget(created.upload, bucket);
		if (!path || !token) throw new Error('The upload link was incomplete. Try again.');
		const { error } = await supabase.storage
			.from(bucket)
			.uploadToSignedUrl(path, token, bytes.buffer, { contentType });
		if (error) throw new Error(error.message || 'The image did not upload. Try again.');
		if (asset.project_id && asset.kind !== 'temporary_file') {
			asset = (await api.chat.completeImageAttachment(asset.id)).asset ?? asset;
		}
	}
	return turnAttachment(asset, pick, options.order);
}
