// Local visual fixture; never exposed in a production build.
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

export function load() {
	if (!dev) error(404, 'Not found');
}
