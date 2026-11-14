// apps/mobile/src/lib/chat/images.ts
// Images in chat, the rules part (no Expo imports, so it runs in node tests). Same limits and
// copy as the website's composer (apps/web/src/lib/components/agent/agent-chat-attachments.
// svelte.ts): up to 4 images a message, 25 MB each. A Workspace chat sends temporary files
// (kept 24 h); a project chat keeps them as the project's images.
import type {
	AgentTurnAttachment,
	ChatHistoryMessage,
	ChatImageAttachmentAsset
} from '@buildos/api-client';

export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** One image the person picked, as the picker hands it over. */
export type PickedImage = {
	uri: string;
	width: number | null;
	height: number | null;
	fileName: string | null;
	mimeType: string | null;
	fileSize: number | null;
};

export type DraftImage = PickedImage & {
	id: string;
	status: 'uploading' | 'ready' | 'failed';
	error: string | null;
	/** What the turn sends, once uploaded. */
	attachment: AgentTurnAttachment | null;
};

/** An image shown in a sent message: a local file just sent, or a stored preview. */
export type MessageImage = {
	key: string;
	/** A local file uri, or a site path that needs the bearer token (`/api/onto/assets/...`). */
	uri: string | null;
	remote: boolean;
	fileName: string | null;
};

/** Which picks fit (count, size, type), and what to tell the person about the rest. */
export function acceptPicks(
	current: number,
	picks: readonly PickedImage[]
): { accepted: PickedImage[]; error: string | null } {
	const accepted: PickedImage[] = [];
	let error: string | null = null;
	for (const pick of picks) {
		if (pick.mimeType && !pick.mimeType.startsWith('image/')) {
			error = 'Only images can be attached.';
			continue;
		}
		if (pick.fileSize !== null && pick.fileSize > MAX_IMAGE_BYTES) {
			error = `${pick.fileName ?? 'That image'} exceeds the 25MB limit.`;
			continue;
		}
		if (current + accepted.length >= MAX_IMAGES) {
			error = `Attach up to ${MAX_IMAGES} images per message.`;
			break;
		}
		accepted.push(pick);
	}
	return { accepted, error };
}

/** "Attached 1 image", the words a message with only images shows (as the website does). */
export function attachedLine(count: number): string {
	return `Attached ${count} ${count === 1 ? 'image' : 'images'}`;
}

/** Lowercase hex of a digest. */
export function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join(
		''
	);
}

/** A file name the server accepts: the picker's, else one from the type. */
export function imageFileName(pick: PickedImage, index: number): string {
	if (pick.fileName?.trim()) return pick.fileName.trim();
	const ext = (pick.mimeType ?? 'image/jpeg').split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
	return `photo-${index + 1}.${ext}`;
}

/**
 * The signed upload target's path and token (the web's parseSignedUploadTarget): the response
 * gives both, and older ones only the URL.
 */
export function signedTarget(
	upload: { signed_url: string; path: string; token: string | null },
	bucket: string
): { path: string | null; token: string | null } {
	let path = upload.path?.trim() || null;
	let token = upload.token?.trim() || null;
	if ((!path || !token) && upload.signed_url) {
		try {
			const url = new URL(upload.signed_url);
			token ??= url.searchParams.get('token');
			const marker = '/object/upload/sign/';
			const at = url.pathname.indexOf(marker);
			if (!path && at >= 0) {
				const full = decodeURIComponent(url.pathname.slice(at + marker.length)).replace(
					/^\/+/,
					''
				);
				path = full.startsWith(`${bucket}/`)
					? full.slice(bucket.length + 1)
					: full.split('/').slice(1).join('/');
			}
		} catch {
			// Not a URL: keep what the response gave.
		}
	}
	return { path, token };
}

/** The turn's reference to an uploaded image. */
export function turnAttachment(
	asset: ChatImageAttachmentAsset,
	pick: PickedImage,
	order: number
): AgentTurnAttachment {
	if (asset.project_id && asset.kind !== 'temporary_file') {
		return {
			attachmentKind: 'onto_asset',
			mediaType: 'image',
			assetId: asset.id,
			projectId: asset.project_id,
			displayOrder: order
		};
	}
	return {
		attachmentKind: 'temporary_file',
		mediaType: 'image',
		temporaryAttachmentId: asset.id,
		storageBucket: asset.storage_bucket,
		storagePath: asset.storage_path,
		fileName: asset.original_filename ?? pick.fileName,
		contentType: asset.content_type,
		fileSizeBytes: asset.file_size_bytes,
		width: asset.width ?? pick.width,
		height: asset.height ?? pick.height,
		checksumSha256: asset.checksum_sha256,
		expiresAt: asset.expires_at ?? null,
		displayOrder: order
	};
}

/** Send is allowed once every image is up; failed ones must be removed first. */
export function draftState(
	images: readonly DraftImage[]
): 'empty' | 'uploading' | 'failed' | 'ready' {
	if (images.length === 0) return 'empty';
	if (images.some((image) => image.status === 'failed')) return 'failed';
	if (images.some((image) => image.status === 'uploading')) return 'uploading';
	return 'ready';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A stored message's images (`messages[].attachments` from the session read): project images
 * have a preview path; temporary files have none and show as a placeholder.
 */
export function messageImages(
	message: Pick<ChatHistoryMessage, 'id'> & { attachments?: unknown }
): MessageImage[] {
	const list = Array.isArray(message.attachments) ? message.attachments : [];
	return list.filter(isRecord).map((attachment, index) => {
		const metadata = isRecord(attachment.metadata) ? attachment.metadata : {};
		const preview = typeof metadata.preview_url === 'string' ? metadata.preview_url : null;
		const id =
			(typeof attachment.asset_id === 'string' && attachment.asset_id) ||
			(typeof attachment.temporary_attachment_id === 'string' &&
				attachment.temporary_attachment_id) ||
			`${message.id}:${index}`;
		return {
			key: id,
			uri: preview,
			remote: preview !== null,
			fileName: typeof attachment.file_name === 'string' ? attachment.file_name : null
		};
	});
}

/** A message sent with only images stores no words; the website hides its text. */
export function isAttachmentOnly(metadata: unknown): boolean {
	return isRecord(metadata) && metadata.attachment_only === true;
}
