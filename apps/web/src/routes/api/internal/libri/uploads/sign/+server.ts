import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { PRIVATE_SUPABASE_SERVICE_KEY } from '$env/static/private';
import { signLibriUserUpload } from '$lib/server/libri/user-upload-signing';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) =>
	signLibriUserUpload(request, {
		enabled: env.PRIVATE_LIBRI_UPLOAD_SIGNING_ENABLED === 'true',
		url: PUBLIC_SUPABASE_URL,
		publicKey: PUBLIC_SUPABASE_ANON_KEY,
		serviceKey: PRIVATE_SUPABASE_SERVICE_KEY
	});
