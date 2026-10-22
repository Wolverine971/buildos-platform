// apps/web/src/routes/beta/[...path]/+page.server.ts
// The beta program is closed to new applicants (2026-10-22). Existing beta members and their
// records stay in beta_members / beta_signups and remain manageable from /admin/beta.
// Old links (/beta, /beta/thank-you?email=...) go to the homepage; the query is dropped so an
// email address never rides along.
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	throw redirect(301, '/');
};
