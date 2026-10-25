// apps/web/src/lib/server/builder-profile/builder-profile-images.ts
//
// Profile photo and cover image for builder pages. The browser crops and shrinks the
// image first (512×512 photo, 1500×500 cover); the server checks the bytes really are
// an image, stores it in the public `builder-profile-images` bucket under the owner's
// folder with a fresh name, points the page at it, and removes the image it replaced.

import type { SupabaseClient } from '@supabase/supabase-js';
import { BuilderProfileError, saveSettings } from './builder-profile.service';

type Client = SupabaseClient<any>;

export const PROFILE_IMAGE_BUCKET = 'builder-profile-images';
export const MAX_PROFILE_IMAGE_BYTES = 4 * 1024 * 1024;

export type ProfileImageKind = 'avatar' | 'cover';

const COLUMN: Record<ProfileImageKind, 'avatar_url' | 'cover_url'> = {
	avatar: 'avatar_url',
	cover: 'cover_url'
};

export function parseImageKind(value: unknown): ProfileImageKind | null {
	return value === 'avatar' || value === 'cover' ? value : null;
}

/** The image type from its first bytes (never the name or the declared type). */
export function sniffImage(bytes: Uint8Array): { contentType: string; ext: string } | null {
	const at = (i: number) => bytes[i] ?? -1;
	if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff)
		return { contentType: 'image/jpeg', ext: 'jpg' };
	if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
		return { contentType: 'image/png', ext: 'png' };
	}
	const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
	if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
		return { contentType: 'image/webp', ext: 'webp' };
	}
	return null;
}

/**
 * The object path inside our bucket for a URL we stored for this user, or null for
 * anything else (a Google photo, someone else's folder, another host).
 */
export function ownedObjectPath(
	url: string | null | undefined,
	publicBase: string,
	userId: string
) {
	if (!url) return null;
	const prefix = `${publicBase.replace(/\/$/, '')}/`;
	if (!url.startsWith(prefix)) return null;
	const path = decodeURIComponent(url.slice(prefix.length).split('?')[0] ?? '');
	if (!path.startsWith(`${userId}/`) || path.includes('..')) return null;
	return path;
}

function publicBaseFor(admin: Client): string {
	// getPublicUrl('') gives ".../storage/v1/object/public/<bucket>/".
	return admin.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl('').data.publicUrl;
}

async function currentUrl(admin: Client, userId: string, kind: ProfileImageKind) {
	const column = COLUMN[kind];
	const { data } = await admin
		.from('builder_profiles')
		.select(column)
		.eq('user_id', userId)
		.maybeSingle();
	return ((data as Record<string, string | null> | null)?.[column] ?? null) as string | null;
}

async function removeIfOwned(admin: Client, userId: string, url: string | null) {
	const path = ownedObjectPath(url, publicBaseFor(admin), userId);
	if (!path) return;
	const { error } = await admin.storage.from(PROFILE_IMAGE_BUCKET).remove([path]);
	if (error) console.error('[BuilderProfile] could not remove old image', error);
}

export async function storeProfileImage(params: {
	admin: Client;
	userId: string;
	kind: ProfileImageKind;
	bytes: Uint8Array;
}): Promise<string> {
	const { admin, userId, kind, bytes } = params;
	if (bytes.length === 0) throw new BuilderProfileError('That image is empty.');
	if (bytes.length > MAX_PROFILE_IMAGE_BYTES) {
		throw new BuilderProfileError('That image is too large. Try a smaller one.', 413);
	}
	const type = sniffImage(bytes);
	if (!type) throw new BuilderProfileError('Use a JPG, PNG or WebP image.', 415);

	const previous = await currentUrl(admin, userId, kind);
	const path = `${userId}/${kind}-${crypto.randomUUID()}.${type.ext}`;
	const bucket = admin.storage.from(PROFILE_IMAGE_BUCKET);
	const { error } = await bucket.upload(path, bytes, {
		contentType: type.contentType,
		cacheControl: '31536000',
		upsert: false
	});
	if (error) throw error;

	const url = bucket.getPublicUrl(path).data.publicUrl;
	try {
		await saveSettings({ admin, userId, patch: { [COLUMN[kind]]: url } });
	} catch (err) {
		await bucket.remove([path]);
		throw err;
	}
	if (previous !== url) await removeIfOwned(admin, userId, previous);
	return url;
}

export async function clearProfileImage(params: {
	admin: Client;
	userId: string;
	kind: ProfileImageKind;
}): Promise<void> {
	const { admin, userId, kind } = params;
	const previous = await currentUrl(admin, userId, kind);
	await saveSettings({ admin, userId, patch: { [COLUMN[kind]]: null } });
	await removeIfOwned(admin, userId, previous);
}
