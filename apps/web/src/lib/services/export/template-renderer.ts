// apps/web/src/lib/services/export/template-renderer.ts
/**
 * Template Renderer Service
 * Handles variable substitution in HTML templates for PDF export
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { format } from 'date-fns';
import { fileURLToPath } from 'url';

export interface TemplateData {
	project: {
		name: string;
		status: string | null;
		startDate: string | null;
		endDate: string | null;
		context: string; // Already processed markdown → HTML
	};
	metadata: {
		generatedAt: string;
		generatedBy: string;
	};
}

export class TemplateRenderer {
	private templateCache: Map<string, string> = new Map();
	private readonly templateDir: string;

	constructor(templateDir?: string) {
		if (templateDir) {
			this.templateDir = templateDir;
		} else {
			// Use import.meta.url for reliable path resolution that works on Vercel
			// This resolves relative to THIS file's location
			const __filename = fileURLToPath(import.meta.url);
			const __dirname = dirname(__filename);
			this.templateDir = join(__dirname, '../../templates/export');
		}
	}

	/**
	 * Render a template with provided data
	 */
	async render(templateName: string, data: TemplateData): Promise<string> {
		const template = await this.loadTemplate(templateName);
		return this.substituteVariables(template, data);
	}

	/**
	 * Load template from file system (with caching)
	 */
	private async loadTemplate(templateName: string): Promise<string> {
		// Check cache first
		if (this.templateCache.has(templateName)) {
			return this.templateCache.get(templateName)!;
		}

		// Load from file system
		const templatePath = join(this.templateDir, `${templateName}.html`);
		const template = await readFile(templatePath, 'utf-8');

		// Cache for future use
		this.templateCache.set(templateName, template);

		return template;
	}

	/**
	 * Substitute template variables with actual data
	 */
	private substituteVariables(template: string, data: TemplateData): string {
		let result = template;

		// Project data
		result = result.replace(/\{\{projectName\}\}/g, this.escape(data.project.name));
		result = result.replace(/\{\{projectStatus\}\}/g, data.project.status || '');
		result = result.replace(
			/\{\{projectStatusLabel\}\}/g,
			this.formatStatusLabel(data.project.status)
		);

		// Format dates
		const startDate = data.project.startDate ? this.formatDate(data.project.startDate) : null;
		const endDate = data.project.endDate ? this.formatDate(data.project.endDate) : null;

		result = result.replace(/\{\{projectStartDate\}\}/g, startDate || '');
		result = result.replace(/\{\{projectEndDate\}\}/g, endDate || '');

		// Context (already HTML, no escaping needed)
		result = result.replace(/\{\{\{projectContext\}\}\}/g, data.project.context || '');

		// Conditional rendering helpers
		result = result.replace(/\{\{#if hasStatus\}\}/g, data.project.status ? '' : '<!--');
		result = result.replace(/\{\{\/if\}\}/g, data.project.status ? '' : '-->');

		result = result.replace(/\{\{#if hasStartDate\}\}/g, data.project.startDate ? '' : '<!--');
		result = result.replace(/\{\{#if hasEndDate\}\}/g, data.project.endDate ? '' : '<!--');

		// Logo path (file:// URL for Puppeteer)
		const logoAbsolutePath = join(this.templateDir, 'assets', 'brain-bolt-export.png');
		// Convert to file:// URL for Puppeteer compatibility
		const logoPath = `file://${logoAbsolutePath}`;
		result = result.replace(/\{\{logoPath\}\}/g, logoPath);

		// Metadata
		const generatedDate = this.formatDate(data.metadata.generatedAt);
		result = result.replace(/\{\{generatedDate\}\}/g, generatedDate);
		result = result.replace(/\{\{generatedBy\}\}/g, data.metadata.generatedBy);

		return result;
	}

	/**
	 * Escape HTML special characters
	 */
	private escape(text: string): string {
		const escapeMap: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;'
		};

		return text.replace(/[&<>"']/g, (char) => escapeMap[char]);
	}

	/**
	 * Format date for display
	 */
	private formatDate(dateString: string): string {
		try {
			const date = new Date(dateString);
			return format(date, 'MMM d, yyyy');
		} catch {
			return dateString;
		}
	}

	/**
	 * Format status label (capitalize)
	 */
	private formatStatusLabel(status: string | null): string {
		if (!status) return '';
		return status.charAt(0).toUpperCase() + status.slice(1);
	}

	/**
	 * Clear template cache (useful for development)
	 */
	clearCache(): void {
		this.templateCache.clear();
	}
}
