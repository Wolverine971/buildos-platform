// apps/web/src/routes/admin/users/[id]/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	redirect(302, `/admin/users?search=${encodeURIComponent(params.id)}`);
};
