import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { PRIVATE_SUPABASE_SERVICE_KEY } from '$env/static/private';
import { maintainLibriUpload } from '$lib/server/libri/upload-maintenance';
import type { RequestHandler } from './$types';

// Allow the broker's bounded 25-second operation to report its outcome before
// the hosting platform terminates the request (the app default is 10 seconds).
export const config = { maxDuration: 30 };

export const POST: RequestHandler = ({ request }) =>
	maintainLibriUpload(request, {
		enabled: env.PRIVATE_LIBRI_UPLOAD_MAINTENANCE_ENABLED === 'true',
		url: PUBLIC_SUPABASE_URL,
		serviceKey: PRIVATE_SUPABASE_SERVICE_KEY,
		brokerToken: env.PRIVATE_LIBRI_ASSET_BROKER_TOKEN
	});
