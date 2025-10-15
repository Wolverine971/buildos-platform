// apps/web/src/lib/services/export/markdown-processor.ts
/**
 * Markdown Processor Service
 * Converts markdown to HTML for PDF export with custom styling
 */

import { marked } from 'marked';

export interface MarkdownOptions {
	sanitize?: boolean;
	gfm?: boolean; // GitHub Flavored Markdown
	breaks?: boolean; // Convert \n to <br>
}

export class MarkdownProcessor {
	private renderer: marked.Renderer;

	constructor() {
		// Configure marked with custom renderer
		this.renderer = new marked.Renderer();

		// Customize heading rendering to add proper classes
		this.renderer.heading = ({ tokens, depth }) => {
			const text = this.parseInline(tokens);
			return `<h${depth}>${text}</h${depth}>\n`;
		};

		// Customize paragraph rendering
		this.renderer.paragraph = ({ tokens }) => {
			const text = this.parseInline(tokens);
			return `<p>${text}</p>\n`;
		};

		// Customize code block rendering
		this.renderer.code = ({ text, lang }) => {
			const language = lang || '';
			return `<pre><code class="language-${language}">${this.escapeHtml(text)}</code></pre>\n`;
		};

		// Customize inline code rendering
		this.renderer.codespan = ({ text }) => {
			return `<code>${this.escapeHtml(text)}</code>`;
		};

		// Customize link rendering (add href in parentheses for print)
		this.renderer.link = ({ href, title, tokens }) => {
			const text = this.parseInline(tokens);
			const titleAttr = title ? ` title="${this.escapeHtml(title)}"` : '';
			return `<a href="${href}"${titleAttr}>${text}</a>`;
		};

		// Customize blockquote rendering
		this.renderer.blockquote = ({ tokens }) => {
			const text = this.parseBlockTokens(tokens);
			return `<blockquote>\n${text}</blockquote>\n`;
		};

		// Customize list rendering
		this.renderer.list = ({ ordered, start, items }) => {
			const tag = ordered ? 'ol' : 'ul';
			const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
			const body = items.map((item) => this.parseListItem(item)).join('\n');
			return `<${tag}${startAttr}>\n${body}\n</${tag}>\n`;
		};

		// Customize table rendering
		this.renderer.table = ({ header, rows }) => {
			const head = `<thead>\n<tr>\n${header.map((cell) => `<th>${this.parseInline(cell.tokens)}</th>`).join('\n')}\n</tr>\n</thead>`;
			const body = `<tbody>\n${rows.map((row) => `<tr>\n${row.map((cell) => `<td>${this.parseInline(cell.tokens)}</td>`).join('\n')}\n</tr>`).join('\n')}\n</tbody>`;
			return `<table>\n${head}\n${body}\n</table>\n`;
		};
	}

	/**
	 * Process markdown content to HTML
	 */
	async process(markdown: string, options: MarkdownOptions = {}): Promise<string> {
		if (!markdown || markdown.trim() === '') {
			return '<p class="text-gray-500 italic">No context document provided.</p>';
		}

		// Configure marked options
		marked.setOptions({
			renderer: this.renderer,
			gfm: options.gfm !== false, // GitHub Flavored Markdown enabled by default
			breaks: options.breaks || false,
			pedantic: false,
			mangle: false,
			headerIds: false
		});

		try {
			// Convert markdown to HTML
			const html = await marked.parse(markdown);

			// Sanitize if requested
			if (options.sanitize) {
				return this.sanitize(html);
			}

			return html;
		} catch (error) {
			console.error('Markdown processing error:', error);
			return `<p class="text-red-600">Error processing markdown content.</p>`;
		}
	}

	/**
	 * Parse inline tokens to HTML
	 */
	private parseInline(tokens: marked.Token[]): string {
		if (!tokens || tokens.length === 0) return '';

		// Manually process inline tokens to avoid recursion
		return tokens
			.map((token) => {
				switch (token.type) {
					case 'text':
						return token.text;
					case 'strong':
						return `<strong>${this.parseInline(token.tokens || [])}</strong>`;
					case 'em':
						return `<em>${this.parseInline(token.tokens || [])}</em>`;
					case 'codespan':
						return this.renderer.codespan(token);
					case 'link':
						return this.renderer.link(token);
					case 'del':
						return `<del>${this.parseInline(token.tokens || [])}</del>`;
					case 'br':
						return '<br />';
					case 'escape':
						return token.text;
					default:
						// For unknown types, return raw or text
						return token.raw || token.text || '';
				}
			})
			.join('');
	}

	/**
	 * Parse block tokens
	 */
	private parseBlockTokens(tokens: marked.Token[]): string {
		return marked.parser(tokens, {
			renderer: this.renderer
		});
	}

	/**
	 * Parse list item
	 */
	private parseListItem(item: marked.Tokens.ListItem): string {
		const text = this.parseBlockTokens(item.tokens);
		return `<li>${text}</li>`;
	}

	/**
	 * Escape HTML special characters
	 */
	private escapeHtml(text: string): string {
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
	 * Sanitize HTML (basic implementation)
	 * Remove potentially dangerous tags and attributes
	 */
	private sanitize(html: string): string {
		// Remove script tags
		let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

		// Remove event handlers
		sanitized = sanitized.replace(/\son\w+="[^"]*"/gi, '');
		sanitized = sanitized.replace(/\son\w+='[^']*'/gi, '');

		// Remove dangerous protocols from links
		sanitized = sanitized.replace(/href="javascript:[^"]*"/gi, 'href="#"');
		sanitized = sanitized.replace(/href='javascript:[^']*'/gi, "href='#'");

		return sanitized;
	}

	/**
	 * Extract plain text from markdown (for previews, search, etc.)
	 */
	async extractPlainText(markdown: string): Promise<string> {
		const html = await this.process(markdown);

		// Remove HTML tags
		const text = html.replace(/<[^>]*>/g, '');

		// Decode HTML entities
		const decoded = text
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'");

		return decoded.trim();
	}

	/**
	 * Get word count from markdown
	 */
	async getWordCount(markdown: string): Promise<number> {
		const plainText = await this.extractPlainText(markdown);
		const words = plainText.split(/\s+/).filter((word) => word.length > 0);
		return words.length;
	}
}
