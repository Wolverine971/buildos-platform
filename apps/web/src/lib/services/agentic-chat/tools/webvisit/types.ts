// apps/web/src/lib/services/agentic-chat/tools/webvisit/types.ts

export type WebVisitMode = 'auto' | 'reader' | 'raw';

export interface WebVisitArgs {
	url: string;
	mode?: WebVisitMode;
	max_chars?: number;
	include_links?: boolean;
	allow_redirects?: boolean;
	prefer_language?: string;
}

export interface WebVisitLink {
	url: string;
	text?: string;
}

export type WebVisitParser = 'reader' | 'raw' | 'text';

export interface WebVisitResultPayload {
	url: string;
	final_url: string;
	status_code: number;
	content_type?: string | null;
	title?: string;
	content: string;
	excerpt?: string;
	truncated: boolean;
	links?: WebVisitLink[];
	message: string;
	info: {
		fetched_at: string;
		mode: WebVisitMode;
		bytes: number;
		fetch_ms: number;
		parser: WebVisitParser;
	};
}
