// apps/web/src/lib/services/agentic-chat/tools/buildos/types.ts
/**
 * Shared types for BuildOS knowledge tools.
 *
 * These interfaces keep the tool payloads structured so the LLM can
 * reason about sections, highlights, and source documents.
 */

export interface BuildosDocReference {
	title: string;
	summary: string;
}

export interface BuildosDocSection {
	title: string;
	summary: string;
	highlights: string[];
	references: BuildosDocReference[];
}

export interface BuildosDocPayload {
	documentTitle: string;
	lastReviewed: string;
	summary: string;
	sections: BuildosDocSection[];
	recommendedQuestions: string[];
	followUpActions: string[];
	notes?: string[];
}

export type BuildosDocGenerator = () => BuildosDocPayload;
