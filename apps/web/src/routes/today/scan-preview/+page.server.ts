// apps/web/src/routes/today/scan-preview/+page.server.ts
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

export function load() {
	if (!dev) error(404, 'Not found');
}
