// apps/web/src/lib/services/agentic-chat/tools/webvisit/types.ts

export type WebVisitMode = 'auto' | 'reader' | 'raw';
export type WebVisitContentFormat = 'text' | 'markdown';

export interface WebVisitArgs {
	url: string;
	mode?: WebVisitMode;
	max_chars?: number;
	max_html_chars?: number;
	output_format?: WebVisitContentFormat;
	persist?: boolean;
	force_refresh?: boolean;
	include_links?: boolean;
	allow_redirects?: boolean;
	prefer_language?: string;
}

export interface WebVisitLink {
	url: string;
	text?: string;
}

export type WebVisitParser = 'reader' | 'raw' | 'text';

export interface WebVisitFetchPayload {
	url: string;
	final_url: string;
	status_code: number;
	content_type?: string | null;
	title?: string;
	text: string;
	trimmed_html?: string;
	meta?: Record<string, string>;
	canonical_url?: string;
	links?: WebVisitLink[];
	message: string;
	info: {
		fetched_at: string;
		mode: WebVisitMode;
		bytes: number;
		fetch_ms: number;
		parser: WebVisitParser;
		html_chars?: number;
	};
}

export interface WebVisitResultPayload {
	url: string;
	final_url: string;
	status_code: number;
	content_type?: string | null;
	title?: string;
	canonical_url?: string;
	content_format: WebVisitContentFormat;
	content: string;
	excerpt?: string;
	truncated: boolean;
	links?: WebVisitLink[];
	meta?: Record<string, string>;
	visit_id?: string;
	stored?: boolean;
	message: string;
	info: {
		fetched_at: string;
		mode: WebVisitMode;
		bytes: number;
		fetch_ms: number;
		parser: WebVisitParser;
		html_chars?: number;
		markdown_chars?: number;
		llm_model?: string;
		llm_ms?: number;
		llm_prompt_tokens?: number;
		llm_completion_tokens?: number;
		llm_total_tokens?: number;
		cache_hit?: boolean;
	};
}
