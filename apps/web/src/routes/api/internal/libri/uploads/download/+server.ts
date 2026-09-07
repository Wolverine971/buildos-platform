import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { PRIVATE_SUPABASE_SERVICE_KEY } from '$env/static/private';
import { signLibriUploadDownload } from '$lib/server/libri/upload-download-signing';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) =>
	signLibriUploadDownload(request, {
		enabled: env.PRIVATE_LIBRI_UPLOAD_DOWNLOAD_SIGNING_ENABLED === 'true',
		url: PUBLIC_SUPABASE_URL,
		serviceKey: PRIVATE_SUPABASE_SERVICE_KEY,
		brokerToken: env.PRIVATE_LIBRI_ASSET_BROKER_TOKEN
	});
