// apps/web/src/routes/api/projects/[id]/export/pdf/+server.ts
/**
 * PDF Export API Endpoint
 * GET /api/projects/:id/export/pdf
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ProjectExportService } from '$lib/services/export/project-export.service';
import { ApiResponse } from '$utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	try {
		// 1. Verify user authentication
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const projectId = params.id;
		const userId = user.id;

		// 2. Get Supabase client
		if (!supabase) {
			throw error(500, 'Database connection not available');
		}

		// 3. Create export service
		const exportService = new ProjectExportService(supabase);

		// 4. Validate request
		exportService.validateExportRequest(projectId, userId);

		// 5. Check if PDF export is available
		const isPDFAvailable = await exportService.isPDFExportAvailable();
		if (!isPDFAvailable) {
			throw error(503, 'PDF export service unavailable. Please contact support.');
		}

		// 6. Generate PDF
		const result = await exportService.exportToPDF(projectId, userId);

		// 7. Fetch project for filename
		const { data: project } = await supabase
			.from('projects')
			.select('slug, name')
			.eq('id', projectId)
			.single();

		const filename = exportService.generateFilename(
			{ ...project, id: projectId } as any,
			'pdf'
		);

		// 8. Return PDF with appropriate headers
		// Convert Buffer to Uint8Array for Response compatibility
		const pdfData = new Uint8Array(result.buffer);

		return new Response(pdfData, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Content-Length': result.fileSizeBytes.toString(),
				'X-Generation-Time': result.generationTimeMs.toString(),
				'Cache-Control': 'private, no-cache, no-store, must-revalidate',
				Expires: '0',
				Pragma: 'no-cache'
			}
		});
	} catch (err: any) {
		console.error('PDF export error:', err);

		// Handle specific error cases
		if (err.status === 401 || err.status === 403) {
			throw err;
		}

		if (err.message?.includes('not found') || err.message?.includes('access denied')) {
			throw error(404, 'Project not found or access denied');
		}

		if (err.message?.includes('WeasyPrint')) {
			throw error(500, 'PDF generation failed. Please try again.');
		}

		if (err.message?.includes('timeout')) {
			throw error(408, 'PDF generation timed out. The document may be too large.');
		}

		// Generic error
		throw error(500, 'Failed to generate PDF export');
	}
};
