// src/routes/signup/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Permanent redirect (308) from /signup to /auth/register
	// You can use 307 for temporary redirect or 301/302 for older HTTP versions
	throw redirect(308, '/auth/register');
};
