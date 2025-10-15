// apps/web/src/lib/services/export/pdf-generator.ts
/**
 * PDF Generator Service
 * Uses Puppeteer + Chromium for PDF generation from HTML (Vercel-compatible)
 */

import { readFileSync } from 'fs';
import { dev } from '$app/environment';

export interface PDFOptions {
	cssPath: string;
	pageSize?: 'A4' | 'Letter';
	timeout?: number; // milliseconds
	dpi?: number;
}

export interface PDFGenerationResult {
	buffer: Buffer;
	fileSizeBytes: number;
	generationTimeMs: number;
}

export class PDFGenerator {
	/**
	 * Generate PDF from HTML string using Puppeteer + Chromium
	 */
	async generatePDF(html: string, options: PDFOptions): Promise<PDFGenerationResult> {
		const startTime = Date.now();

		try {
			// 1. Read CSS file if provided
			let cssContent = '';
			if (options.cssPath) {
				try {
					cssContent = readFileSync(options.cssPath, 'utf-8');
				} catch (error) {
					console.warn('Could not read CSS file:', options.cssPath);
				}
			}

			// 2. Inject CSS into HTML
			const htmlWithCSS = this.injectCSS(html, cssContent);

			// 3. Launch browser
			const browser = await this.launchBrowser(options.timeout || 60000);

			try {
				// 4. Create page and set content
				const page = await browser.newPage();

				// Set viewport for consistent rendering
				await page.setViewport({
					width: 794, // A4 width in pixels at 96 DPI
					height: 1123, // A4 height in pixels at 96 DPI
					deviceScaleFactor: 1
				});

				// Set content with wait for resources
				await page.setContent(htmlWithCSS, {
					waitUntil: ['networkidle0', 'domcontentloaded'],
					timeout: options.timeout || 60000
				});

				// 5. Generate PDF
				const pdfBuffer = await page.pdf({
					format: options.pageSize || 'A4',
					printBackground: true,
					preferCSSPageSize: false,
					margin: {
						top: '25mm',
						right: '20mm',
						bottom: '20mm',
						left: '25mm'
					},
					displayHeaderFooter: false,
					timeout: options.timeout || 60000
				});

				// 6. Calculate metrics
				const buffer = Buffer.from(pdfBuffer);
				const fileSizeBytes = buffer.length;
				const generationTimeMs = Date.now() - startTime;

				return {
					buffer,
					fileSizeBytes,
					generationTimeMs
				};
			} finally {
				// Always close browser
				await browser.close();
			}
		} catch (error) {
			throw this.handleError(error);
		}
	}

	/**
	 * Launch Puppeteer browser with Chromium
	 */
	private async launchBrowser(timeout: number) {
		// Check if we're in development mode
		// SvelteKit dev mode has NODE_ENV as 'development' or undefined
		const isDev = dev; // process.env.NODE_ENV !== 'production';

		console.log('[PDF Generator] Environment:', {
			NODE_ENV: dev,
			isDev,
			mode: isDev ? 'development' : 'production'
		});

		if (isDev) {
			// Development: Use full puppeteer package (includes Chromium)
			// Use @vite-ignore to prevent Vite from bundling puppeteer in production
			try {
				// Dynamic import with string to prevent static analysis
				const puppeteer = await import(/* @vite-ignore */ 'puppeteer');
				console.log('Using local Puppeteer with bundled Chromium');
				return await puppeteer.default.launch({
					headless: true,
					args: ['--no-sandbox', '--disable-setuid-sandbox'],
					timeout
				});
			} catch (error) {
				console.error('Failed to launch local Puppeteer:', error);
				throw new Error('Puppeteer not available for local development');
			}
		} else {
			// Production: Use puppeteer-core + @sparticuz/chromium (Vercel-optimized)
			const puppeteerCore = await import(/* @vite-ignore */ 'puppeteer-core');
			const chromium = await import(/* @vite-ignore */ '@sparticuz/chromium');

			return await puppeteerCore.default.launch({
				args: chromium.default.args,
				executablePath: await chromium.default.executablePath(),
				headless: true,
				timeout
			});
		}
	}

	/**
	 * Inject CSS into HTML document
	 */
	private injectCSS(html: string, css: string): string {
		if (!css) return html;

		// Find </head> tag and inject CSS before it
		const styleTag = `<style>${css}</style>`;

		if (html.includes('</head>')) {
			return html.replace('</head>', `${styleTag}\n</head>`);
		}

		// If no </head> tag, wrap entire HTML
		return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${styleTag}
</head>
<body>
${html}
</body>
</html>`;
	}

	/**
	 * Check if PDF generation is available
	 */
	async isAvailable(): Promise<boolean> {
		try {
			const isDev = dev;

			if (isDev) {
				// Check if puppeteer is available
				try {
					await import(/* @vite-ignore */ 'puppeteer');
					return true;
				} catch {
					console.error('Puppeteer not available in development');
					return false;
				}
			}

			// Production: @sparticzu/chromium is always available as a dependency
			return true;
		} catch (error) {
			console.error('PDF generation check failed:', error);
			return false;
		}
	}

	/**
	 * Handle errors and provide user-friendly messages
	 */
	private handleError(error: any): Error {
		const message = error.message || '';

		if (message.includes('timeout') || message.includes('Navigation timeout')) {
			return new Error('PDF generation timed out. The document may be too large or complex.');
		}

		if (message.includes('Failed to launch') || message.includes('Could not find browser')) {
			return new Error(
				'PDF generation service unavailable. Please try again or contact support.'
			);
		}

		if (message.includes('Protocol error') || message.includes('Session closed')) {
			return new Error('PDF generation failed due to browser error. Please try again.');
		}

		if (message.includes('spawn ENOEXEC')) {
			return new Error(
				'PDF generation failed: Chromium binary error. Please ensure puppeteer is installed for local development.'
			);
		}

		// Generic error
		return new Error(`PDF generation failed: ${message}`);
	}

	/**
	 * Get estimated generation time based on content length
	 */
	estimateGenerationTime(htmlLength: number): number {
		// Rough estimate: ~1 second per 10KB of HTML + 2 second base for browser launch
		const baseTime = 2000; // 2 seconds base
		const additionalTime = (htmlLength / 10240) * 1000;
		return Math.ceil(baseTime + additionalTime);
	}
}
