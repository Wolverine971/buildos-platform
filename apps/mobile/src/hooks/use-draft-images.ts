// apps/mobile/src/hooks/use-draft-images.ts
// The images on a message being written: pick from Photos (up to 4), upload each at once in the
// background (lib/chat/image-upload.ts), remove one, and hand the finished set to Send.
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useRef, useState } from 'react';

import { uploadChatImage } from '@/lib/chat/image-upload';
import {
	acceptPicks,
	type DraftImage,
	draftState,
	MAX_IMAGES,
	type MessageImage,
	type PickedImage
} from '@/lib/chat/images';
import { newChatId } from '@/lib/chat/ids';
import type { ChatSendImages } from '@/hooks/use-chat';

function uploadError(error: unknown): string {
	if (error && typeof error === 'object' && 'isNetworkError' in error && error.isNetworkError)
		return 'No connection. Remove it and try again.';
	return error instanceof Error && error.message
		? error.message
		: 'The image did not upload. Remove it and try again.';
}

export function useDraftImages(projectId: string | null) {
	const [images, setImages] = useState<DraftImage[]>([]);
	const [error, setError] = useState<string | null>(null);
	const live = useRef(images);
	live.current = images;

	const patch = (id: string, next: Partial<DraftImage>) =>
		setImages((current) =>
			current.map((image) => (image.id === id ? { ...image, ...next } : image))
		);

	const pick = useCallback(async () => {
		setError(null);
		const room = MAX_IMAGES - live.current.length;
		if (room <= 0) {
			setError(`Attach up to ${MAX_IMAGES} images per message.`);
			return;
		}
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ['images'],
			allowsMultipleSelection: room > 1,
			selectionLimit: room,
			// JPEG at 0.8 keeps a phone photo well under the 25 MB cap and quick to send.
			quality: 0.8
		});
		if (result.canceled) return;
		const picks: PickedImage[] = result.assets.map((asset) => ({
			uri: asset.uri,
			width: asset.width || null,
			height: asset.height || null,
			fileName: asset.fileName ?? null,
			mimeType: asset.mimeType ?? null,
			fileSize: asset.fileSize ?? null
		}));
		const { accepted, error: rejected } = acceptPicks(live.current.length, picks);
		if (rejected) setError(rejected);
		const start = live.current.length;
		const added: DraftImage[] = accepted.map((image) => ({
			...image,
			id: newChatId('row'),
			status: 'uploading',
			error: null,
			attachment: null
		}));
		setImages((current) => [...current, ...added]);
		added.forEach((image, index) => {
			uploadChatImage(image, { projectId, order: start + index })
				.then((attachment) => patch(image.id, { status: 'ready', attachment }))
				.catch((cause: unknown) =>
					patch(image.id, { status: 'failed', error: uploadError(cause) })
				);
		});
	}, [projectId]);

	const remove = useCallback((id: string) => {
		setError(null);
		setImages((current) => current.filter((image) => image.id !== id));
	}, []);

	/** What Send takes, and clears the tray; null while any image is still uploading or failed. */
	const take = useCallback((): ChatSendImages | null => {
		const current = live.current;
		if (draftState(current) !== 'ready') return null;
		const sent: ChatSendImages = {
			attachments: current.map((image, index) => ({
				...image.attachment!,
				displayOrder: index
			})),
			images: current.map(
				(image): MessageImage => ({
					key: image.id,
					uri: image.uri,
					remote: false,
					fileName: image.fileName
				})
			)
		};
		setImages([]);
		return sent;
	}, []);

	return {
		images,
		state: draftState(images),
		error,
		clearError: () => setError(null),
		pick,
		remove,
		take
	};
}
