// apps/web/src/routes/api/projects/[id]/export/preview/+server.ts
/**
 * HTML Preview API Endpoint
 * GET /api/projects/:id/export/preview
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ProjectExportService } from '$lib/services/export/project-export.service';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		// 1. Verify user authentication
		const session = await locals.getSession();
		if (!session?.user) {
			throw error(401, 'Unauthorized - Please sign in');
		}

		const projectId = params.id;
		const userId = session.user.id;

		// 2. Get Supabase client
		const supabase = locals.supabase;
		if (!supabase) {
			throw error(500, 'Database connection not available');
		}

		// 3. Create export service
		const exportService = new ProjectExportService(supabase);

		// 4. Validate request
		exportService.validateExportRequest(projectId, userId);

		// 5. Generate HTML preview
		const html = await exportService.exportToHTML(projectId, userId);

		// 6. Return HTML
		return new Response(html, {
			status: 200,
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'private, no-cache, no-store, must-revalidate',
				Expires: '0',
				Pragma: 'no-cache'
			}
		});
	} catch (err: any) {
		console.error('HTML preview error:', err);

		// Handle specific error cases
		if (err.status === 401 || err.status === 403) {
			throw err;
		}

		if (err.message?.includes('not found') || err.message?.includes('access denied')) {
			throw error(404, 'Project not found or access denied');
		}

		// Generic error
		throw error(500, 'Failed to generate HTML preview');
	}
};
