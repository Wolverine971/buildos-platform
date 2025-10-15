// apps/web/src/lib/services/export/project-export.service.ts
/**
 * Project Export Service
 * Main orchestrator for generating PDF and HTML exports of project context documents
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { TemplateRenderer, type TemplateData } from './template-renderer';
import { PDFGenerator, type PDFGenerationResult } from './pdf-generator';
import { MarkdownProcessor } from './markdown-processor';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface Project {
	id: string;
	name: string;
	slug: string;
	status: string | null;
	start_date: string | null;
	end_date: string | null;
	context: string | null;
	user_id: string;
}

export interface ExportOptions {
	format?: 'pdf' | 'html';
	includeMetadata?: boolean;
}

export interface ExportResult extends PDFGenerationResult {
	projectId: string;
	projectName: string;
	format: 'pdf' | 'html';
}

export class ProjectExportService {
	private templateRenderer: TemplateRenderer;
	private pdfGenerator: PDFGenerator;
	private markdownProcessor: MarkdownProcessor;
	private supabase: SupabaseClient;

	constructor(supabase: SupabaseClient) {
		this.supabase = supabase;
		this.templateRenderer = new TemplateRenderer();
		this.pdfGenerator = new PDFGenerator();
		this.markdownProcessor = new MarkdownProcessor();
	}

	/**
	 * Export project context document to PDF
	 */
	async exportToPDF(projectId: string, userId: string): Promise<ExportResult> {
		// 1. Fetch project data with permissions check
		const project = await this.fetchProjectWithPermissions(projectId, userId);

		// 2. Generate HTML from template
		const html = await this.generateHTML(project);

		// 3. Convert HTML to PDF using WeasyPrint
		const cssPath = this.getAssetPath('context-doc.css');
		const pdfResult = await this.pdfGenerator.generatePDF(html, {
			cssPath,
			timeout: 60000 // 60 second timeout
		});

		return {
			...pdfResult,
			projectId: project.id,
			projectName: project.name,
			format: 'pdf'
		};
	}

	/**
	 * Export project context document to HTML (preview)
	 */
	async exportToHTML(projectId: string, userId: string): Promise<string> {
		// 1. Fetch project data with permissions check
		const project = await this.fetchProjectWithPermissions(projectId, userId);

		// 2. Generate HTML from template
		const html = await this.generateHTML(project);

		// 3. Wrap in preview template with CSS inline
		return this.wrapHTMLForPreview(html);
	}

	/**
	 * Generate HTML from project data
	 */
	private async generateHTML(project: Project): Promise<string> {
		// 1. Process markdown context to HTML
		const contextHTML = await this.markdownProcessor.process(project.context || '', {
			gfm: true
		});

		// 2. Prepare template data
		const templateData: TemplateData = {
			project: {
				name: project.name,
				status: project.status,
				startDate: project.start_date,
				endDate: project.end_date,
				context: contextHTML
			},
			metadata: {
				generatedAt: new Date().toISOString(),
				generatedBy: 'BuildOS'
			}
		};

		// 3. Render HTML template
		const html = await this.templateRenderer.render('context-doc', templateData);

		return html;
	}

	/**
	 * Wrap HTML for browser preview (with inline CSS)
	 */
	private async wrapHTMLForPreview(html: string): Promise<string> {
		// Read CSS file
		const { readFile } = await import('fs/promises');
		const cssPath = this.getAssetPath('context-doc.css');
		const css = await readFile(cssPath, 'utf-8');

		// Inject CSS into HTML
		const htmlWithCSS = html.replace('</head>', `<style>${css}</style>\n</head>`);

		return htmlWithCSS;
	}

	/**
	 * Fetch project with permissions check (RLS enforced)
	 */
	private async fetchProjectWithPermissions(projectId: string, userId: string): Promise<Project> {
		const { data, error } = await this.supabase
			.from('projects')
			.select('id, name, slug, status, start_date, end_date, context, user_id')
			.eq('id', projectId)
			.eq('user_id', userId)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				throw new Error('Project not found or access denied');
			}
			throw new Error(`Failed to fetch project: ${error.message}`);
		}

		if (!data) {
			throw new Error('Project not found');
		}

		return data as Project;
	}

	/**
	 * Get asset path (CSS, logo, etc.)
	 * Uses import.meta.url for Vercel compatibility
	 */
	private getAssetPath(filename: string): string {
		// Resolve path relative to this file's location
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = dirname(__filename);
		return join(__dirname, '../../templates/export', filename);
	}

	/**
	 * Generate filename for export
	 */
	generateFilename(project: Project, format: 'pdf' | 'html'): string {
		const slug = project.slug || project.id;
		const timestamp = new Date().toISOString().split('T')[0];
		return `buildos-${slug}-context-${timestamp}.${format}`;
	}

	/**
	 * Check if PDF export is available
	 */
	async isPDFExportAvailable(): Promise<boolean> {
		return await this.pdfGenerator.isAvailable();
	}

	/**
	 * Validate export request
	 */
	validateExportRequest(projectId: string, userId: string): void {
		if (!projectId || projectId.trim() === '') {
			throw new Error('Project ID is required');
		}

		if (!userId || userId.trim() === '') {
			throw new Error('User ID is required');
		}

		// Validate UUID format
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (!uuidRegex.test(projectId)) {
			throw new Error('Invalid project ID format');
		}
	}
}
