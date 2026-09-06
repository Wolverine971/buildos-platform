import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { PRIVATE_SUPABASE_SERVICE_KEY } from '$env/static/private';
import { signLibriUserImages } from '$lib/server/libri/user-image-signing';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) =>
	signLibriUserImages(request, {
		url: PUBLIC_SUPABASE_URL,
		publicKey: PUBLIC_SUPABASE_ANON_KEY,
		serviceKey: PRIVATE_SUPABASE_SERVICE_KEY
	});
