// apps/web/src/lib/utils/docs.ts
import { error } from '@sveltejs/kit';
import docsIndex from '../../content/docs/_index.json';

export interface DocSectionMeta {
	slug: string;
	title: string;
	summary: string;
	icon: string;
	order: number;
}

export interface DocPage extends DocSectionMeta {
	lastUpdated?: string;
	readingTime: number;
}

type DocsIndex = { sections: DocSectionMeta[] };

type DocModule = {
	default?: unknown;
	metadata?: Record<string, unknown>;
};

const INDEX = docsIndex as DocsIndex;

function isDocModule(module: unknown): module is DocModule & { metadata: Record<string, unknown> } {
	return typeof module === 'object' && module !== null && 'metadata' in module;
}

function estimateReadingTime(module: DocModule): number {
	const metaReading =
		module.metadata && typeof module.metadata.readingTime === 'number'
			? (module.metadata.readingTime as number)
			: null;
	if (metaReading) return metaReading;

	if (module.default && typeof module.default === 'object') {
		try {
			const wordCount = JSON.stringify(module.default).split(/\s+/).length;
			return Math.max(1, Math.ceil(wordCount / 400));
		} catch {
			return 3;
		}
	}
	return 3;
}

export function listDocSections(): DocSectionMeta[] {
	return [...INDEX.sections].sort((a, b) => a.order - b.order);
}

export function getDocSection(slug: string): DocSectionMeta | undefined {
	return INDEX.sections.find((section) => section.slug === slug);
}

function readMarkdownModules(): Record<string, DocModule> {
	return import.meta.glob('/src/content/docs/*.md', { eager: true }) as Record<string, DocModule>;
}

export async function loadDocPage(slug: string): Promise<DocPage> {
	const section = getDocSection(slug);
	if (!section) {
		throw error(404, 'Doc section not found');
	}

	const modules = readMarkdownModules();
	const modulePath = `/src/content/docs/${slug}.md`;
	const module = modules[modulePath];

	if (!module || !isDocModule(module)) {
		throw error(404, 'Doc content not found');
	}

	const metadata = module.metadata;
	const lastUpdated =
		typeof metadata?.lastUpdated === 'string' ? (metadata.lastUpdated as string) : undefined;

	return {
		...section,
		lastUpdated,
		readingTime: estimateReadingTime(module)
	};
}

export function getSiblingDocs(slug: string): {
	prev: DocSectionMeta | null;
	next: DocSectionMeta | null;
} {
	const sections = listDocSections();
	const index = sections.findIndex((section) => section.slug === slug);
	if (index === -1) return { prev: null, next: null };

	return {
		prev: index > 0 ? (sections[index - 1] ?? null) : null,
		next: index < sections.length - 1 ? (sections[index + 1] ?? null) : null
	};
}
