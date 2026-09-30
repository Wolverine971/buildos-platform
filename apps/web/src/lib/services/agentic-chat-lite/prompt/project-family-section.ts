// apps/web/src/lib/services/agentic-chat-lite/prompt/project-family-section.ts
//
// Project hierarchy, phase 1. A project can sit under one parent (Wayne
// Strategies → its client projects). The parent's "Shared with sub-projects"
// folder shows in each child as a read-only shelf. The context loader attaches
// `project_family` (onto_project_family_v1), already filtered to what the user
// can open; this section tells the model where the project sits, which shared
// docs it can open, and which sub-projects a hub holds.
//
// It renders for stewards and non-stewards alike (a steward drops the
// Knowledge Map, not this), and never for a project with no parent and no
// readable sub-projects. The whole section stays within
// PROJECT_FAMILY_SECTION_MAX_CHARS, so a large shelf or hub cannot crowd the
// prompt budget.
import type { ChatContextType } from '@buildos/shared-types';
import { parseProjectFamilyV1, type ProjectFamilyV1 } from '@buildos/shared-types';
import { estimateTokensFromText } from '$lib/services/agentic-chat-v2/context-usage';
import type { LitePromptSection } from './types';

export const PROJECT_FAMILY_SECTION_MAX_CHARS = 1200;
const SHELF_LINE_LIMIT = 12;
const CHILD_LINE_LIMIT = 10;
const NAME_MAX_CHARS = 60;
const NEXT_STEP_MAX_CHARS = 70;
/** Deeper shelf docs render at this indent; the shelf is a folder subtree. */
const SHELF_MAX_INDENT = 3;
/** Room the sub-project block keeps when a project has both a parent and children. */
const CHILDREN_BLOCK_RESERVE_CHARS = 400;

function oneLine(value: string | null | undefined, maxChars: number): string {
	const collapsed = (value ?? '').replace(/\s+/g, ' ').trim();
	return collapsed.length > maxChars
		? `${collapsed.slice(0, maxChars - 1).trimEnd()}…`
		: collapsed;
}

/**
 * The family from loaded context, or null. The loader is the only writer, but
 * the context can come back from a session or prepared-prompt cache, so the
 * shape is parsed again before any of it reaches the prompt.
 */
export function readProjectFamily(data: unknown): ProjectFamilyV1 | null {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
	const family = parseProjectFamilyV1((data as Record<string, unknown>).project_family);
	return family && (family.parent || family.children.length > 0) ? family : null;
}

/**
 * Fit item lines between a fixed header and footer within `budget` chars,
 * reserving room for the "+N more" line whenever anything could be left out.
 */
function fitBlock(params: {
	header: string[];
	items: string[];
	footer: string[];
	lineLimit: number;
	budget: number;
}): { lines: string[]; shown: number; omitted: number } {
	const { header, items, footer, lineLimit, budget } = params;
	const joinedLength = (lines: string[]) =>
		lines.reduce((sum, line) => sum + line.length, 0) + Math.max(0, lines.length - 1);
	const moreLine = (count: number) => `+${count} more`;
	let used = joinedLength([...header, ...footer]);
	const shown: string[] = [];
	for (const item of items) {
		if (shown.length >= lineLimit) break;
		const remainingAfter = items.length - shown.length - 1;
		const reserve = remainingAfter > 0 ? moreLine(items.length).length + 1 : 0;
		if (used + item.length + 1 + reserve > budget) break;
		shown.push(item);
		used += item.length + 1;
	}
	const omitted = items.length - shown.length;
	return {
		lines: [...header, ...shown, ...(omitted > 0 ? [moreLine(omitted)] : []), ...footer],
		shown: shown.length,
		omitted
	};
}

export function buildProjectFamilySection(
	contextType: ChatContextType,
	data: unknown
): LitePromptSection | null {
	// Only project-scoped chats sit in a hierarchy.
	if (contextType !== 'project' && contextType !== 'ontology') return null;
	const family = readProjectFamily(data);
	if (!family) return null;

	const blocks: string[] = [];
	let shelfShown = 0;
	let shelfOmitted = 0;
	let childrenShown = 0;
	let childrenOmitted = 0;

	if (family.parent) {
		const parentName = oneLine(family.parent.name, NAME_MAX_CHARS) || 'the parent project';
		const header = [`Part of ${parentName} [${family.parent.id}].`];
		if (family.shelf.length === 0) {
			blocks.push(
				[...header, `${parentName} shares no docs with its sub-projects yet.`].join('\n')
			);
		} else {
			const block = fitBlock({
				header: [
					...header,
					`Shared docs, owned by ${parentName} and shown in every sub-project (read-only from this chat):`
				],
				items: family.shelf.map(
					(doc) =>
						`${'  '.repeat(Math.min(Math.max(doc.depth, 0), SHELF_MAX_INDENT))}- ${oneLine(doc.title, NAME_MAX_CHARS) || 'Untitled'} [${doc.id}]`
				),
				footer: [
					`Open them by their document id with the document read tools. If one needs changing, tell the user to edit it in ${parentName}.`
				],
				lineLimit: SHELF_LINE_LIMIT,
				// v1 nests one level, so a child has no children; if it ever does,
				// the sub-project block still gets room.
				budget:
					PROJECT_FAMILY_SECTION_MAX_CHARS -
					(family.children.length > 0 ? CHILDREN_BLOCK_RESERVE_CHARS : 0)
			});
			shelfShown = block.shown;
			shelfOmitted = block.omitted;
			blocks.push(block.lines.join('\n'));
		}
	}

	if (family.children.length > 0) {
		const used = blocks.reduce((sum, block) => sum + block.length + 2, 0);
		const block = fitBlock({
			header: ['Inside this project:'],
			items: family.children.map((child) => {
				const name = oneLine(child.name, NAME_MAX_CHARS) || 'Untitled project';
				const state = child.state_key ? ` (${child.state_key})` : '';
				const next = oneLine(child.next_step_short, NEXT_STEP_MAX_CHARS);
				return `- ${name}${state}${next ? ` — next: ${next}` : ''} [${child.id}]`;
			}),
			footer: [
				"When a question needs one, read it by passing its project_id. Don't write into a sub-project from here."
			],
			lineLimit: CHILD_LINE_LIMIT,
			budget: PROJECT_FAMILY_SECTION_MAX_CHARS - used
		});
		childrenShown = block.shown;
		childrenOmitted = block.omitted;
		blocks.push(block.lines.join('\n'));
	}

	const content = blocks.join('\n\n');
	return {
		id: 'project_family',
		title: 'Project Hierarchy',
		kind: 'dynamic',
		source: 'lite.project_family',
		slots: {
			contextType,
			projectId: family.project_id,
			parentId: family.parent?.id ?? null,
			shelfShown,
			shelfOmitted,
			childrenShown,
			childrenOmitted
		},
		content,
		chars: content.length,
		estimatedTokens: estimateTokensFromText(content)
	};
}
