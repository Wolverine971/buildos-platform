#!/usr/bin/env tsx

/**
 * Validate all documentation links and cross-references
 * Ensures documentation integrity and prevents broken links
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, dirname, resolve, relative } from 'path';
import { existsSync } from 'fs';

interface LinkInfo {
	file: string;
	line: number;
	link: string;
	text: string;
	type: 'internal' | 'external' | 'anchor';
}

interface ValidationResult {
	valid: boolean;
	error?: string;
	status?: number;
}

class DocumentationLinkValidator {
	private readonly docsDir = 'docs';
	private readonly links: LinkInfo[] = [];
	private readonly errors: Array<LinkInfo & { error: string }> = [];

	async validate(): Promise<void> {
		console.log('🔗 Validating documentation links...\n');

		// Scan all documentation files
		await this.scanDocumentationFiles();

		console.log(`📄 Found ${this.links.length} links across documentation\n`);

		// Validate each link
		await this.validateLinks();

		// Report results
		this.reportResults();
	}

	private async scanDocumentationFiles(): Promise<void> {
		await this.scanDirectory(this.docsDir);
	}

	private async scanDirectory(dir: string): Promise<void> {
		if (!existsSync(dir)) {
			console.warn(`⚠️  Documentation directory ${dir} not found`);
			return;
		}

		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				await this.scanDirectory(fullPath);
			} else if (entry.name.endsWith('.md')) {
				await this.scanMarkdownFile(fullPath);
			}
		}
	}

	private async scanMarkdownFile(filePath: string): Promise<void> {
		try {
			const content = await readFile(filePath, 'utf-8');
			const lines = content.split('\n');

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const lineNumber = i + 1;

				// Find markdown links: [text](url)
				const markdownLinks = line.match(/\[([^\]]+)\]\(([^)]+)\)/g);
				if (markdownLinks) {
					for (const match of markdownLinks) {
						const linkMatch = match.match(/\[([^\]]+)\]\(([^)]+)\)/);
						if (linkMatch) {
							const [, text, url] = linkMatch;
							this.links.push({
								file: filePath,
								line: lineNumber,
								link: url,
								text,
								type: this.classifyLink(url)
							});
						}
					}
				}

				// Find reference-style links: [text][ref]
				const refLinks = line.match(/\[([^\]]+)\]\[([^\]]+)\]/g);
				if (refLinks) {
					// Note: Would need to resolve references later
				}

				// Find HTML links: <a href="url">
				const htmlLinks = line.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/g);
				if (htmlLinks) {
					for (const match of htmlLinks) {
						const hrefMatch = match.match(/href=["']([^"']+)["']/);
						if (hrefMatch) {
							const url = hrefMatch[1];
							this.links.push({
								file: filePath,
								line: lineNumber,
								link: url,
								text: match,
								type: this.classifyLink(url)
							});
						}
					}
				}
			}
		} catch (error) {
			console.warn(`⚠️  Failed to scan ${filePath}: ${error}`);
		}
	}

	private classifyLink(url: string): 'internal' | 'external' | 'anchor' {
		if (url.startsWith('#')) {
			return 'anchor';
		}
		if (url.startsWith('http://') || url.startsWith('https://')) {
			return 'external';
		}
		return 'internal';
	}

	private async validateLinks(): Promise<void> {
		console.log('🔍 Validating links...\n');

		let processed = 0;
		const total = this.links.length;

		for (const link of this.links) {
			processed++;
			const progress = Math.round((processed / total) * 100);
			process.stdout.write(`\r   Progress: ${progress}% (${processed}/${total})`);

			const result = await this.validateLink(link);
			if (!result.valid) {
				this.errors.push({
					...link,
					error: result.error || 'Unknown error'
				});
			}
		}

		console.log('\n');
	}

	private async validateLink(link: LinkInfo): Promise<ValidationResult> {
		try {
			switch (link.type) {
				case 'internal':
					return await this.validateInternalLink(link);
				case 'external':
					return await this.validateExternalLink(link);
				case 'anchor':
					return await this.validateAnchorLink(link);
				default:
					return { valid: false, error: 'Unknown link type' };
			}
		} catch (error) {
			return {
				valid: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	private async validateInternalLink(link: LinkInfo): Promise<ValidationResult> {
		const basePath = dirname(link.file);
		let targetPath: string;

		if (link.link.startsWith('./') || link.link.startsWith('../')) {
			// Relative path
			targetPath = resolve(basePath, link.link);
		} else if (link.link.startsWith('/')) {
			// Absolute path from project root
			targetPath = resolve('.', link.link.substring(1));
		} else {
			// Relative to current directory
			targetPath = resolve(basePath, link.link);
		}

		// Check if file exists
		if (!existsSync(targetPath)) {
			return {
				valid: false,
				error: `File not found: ${targetPath}`
			};
		}

		// Check if it's a file or directory
		const stats = await stat(targetPath);
		if (stats.isDirectory()) {
			// Check for index.md or README.md
			const indexFiles = ['index.md', 'README.md'];
			const hasIndex = indexFiles.some((file) => existsSync(join(targetPath, file)));
			if (!hasIndex) {
				return {
					valid: false,
					error: `Directory has no index file: ${targetPath}`
				};
			}
		}

		return { valid: true };
	}

	private async validateExternalLink(link: LinkInfo): Promise<ValidationResult> {
		// For external links, we can optionally check if they're reachable
		// Skip for now to avoid rate limiting and network dependencies

		// Basic URL validation
		try {
			new URL(link.link);
			return { valid: true };
		} catch {
			return {
				valid: false,
				error: 'Invalid URL format'
			};
		}
	}

	private async validateAnchorLink(link: LinkInfo): Promise<ValidationResult> {
		const anchor = link.link.substring(1); // Remove #

		// Read the current file and check for the anchor
		const content = await readFile(link.file, 'utf-8');

		// Look for heading with matching anchor
		const headingRegex = new RegExp(`^#+\\s+(.+)$`, 'gm');
		let match;

		while ((match = headingRegex.exec(content)) !== null) {
			const headingText = match[1];
			const headingAnchor = this.generateAnchor(headingText);

			if (headingAnchor === anchor) {
				return { valid: true };
			}
		}

		return {
			valid: false,
			error: `Anchor not found: #${anchor}`
		};
	}

	private generateAnchor(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
	}

	private reportResults(): void {
		console.log(`\n${'='.repeat(50)}`);
		console.log('📊 LINK VALIDATION RESULTS');
		console.log(`${'='.repeat(50)}`);

		const validLinks = this.links.length - this.errors.length;
		const successRate = Math.round((validLinks / this.links.length) * 100);

		console.log(`Total Links: ${this.links.length}`);
		console.log(`Valid Links: ${validLinks}`);
		console.log(`Broken Links: ${this.errors.length}`);
		console.log(`Success Rate: ${successRate}%\n`);

		if (this.errors.length > 0) {
			console.log('❌ BROKEN LINKS:\n');

			// Group errors by file
			const errorsByFile = this.groupErrorsByFile();

			for (const [file, fileErrors] of Object.entries(errorsByFile)) {
				console.log(`📄 ${file}:`);
				for (const error of fileErrors) {
					console.log(`   Line ${error.line}: ${error.link}`);
					console.log(`   Error: ${error.error}`);
					console.log(`   Text: "${error.text}"\n`);
				}
			}

			// Exit with error code for CI
			process.exit(1);
		} else {
			console.log('✅ All links are valid!');
		}
	}

	private groupErrorsByFile(): Record<string, Array<LinkInfo & { error: string }>> {
		const groups: Record<string, Array<LinkInfo & { error: string }>> = {};

		for (const error of this.errors) {
			if (!groups[error.file]) {
				groups[error.file] = [];
			}
			groups[error.file].push(error);
		}

		return groups;
	}
}

async function main() {
	const validator = new DocumentationLinkValidator();
	await validator.validate();
}

if (require.main === module) {
	main().catch(console.error);
}
