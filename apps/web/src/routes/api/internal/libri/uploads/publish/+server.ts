import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { PRIVATE_SUPABASE_SERVICE_KEY } from '$env/static/private';
import { publishLibriUpload } from '$lib/server/libri/upload-publication';
import type { RequestHandler } from './$types';

// Publication owns up to 20 seconds, including verification and reconciliation.
export const config = { maxDuration: 30 };

export const POST: RequestHandler = ({ request }) =>
	publishLibriUpload(request, {
		enabled: env.PRIVATE_LIBRI_UPLOAD_PUBLICATION_ENABLED === 'true',
		url: PUBLIC_SUPABASE_URL,
		serviceKey: PRIVATE_SUPABASE_SERVICE_KEY,
		brokerToken: env.PRIVATE_LIBRI_ASSET_BROKER_TOKEN
	});
