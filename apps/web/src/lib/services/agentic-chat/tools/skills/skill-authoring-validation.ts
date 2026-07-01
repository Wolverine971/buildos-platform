// apps/web/src/lib/services/agentic-chat/tools/skills/skill-authoring-validation.ts
import { parse as parseYaml } from 'yaml';
import type { SkillDefinition, SkillLinkedResource } from './types';
import {
	PROVENANCE_AUDIT_MARKERS,
	PROVENANCE_CONFIDENCE_TAGS,
	referenceModuleFrontmatterSchema,
	skillFrontmatterSchema,
	type SkillType
} from './skill.schema';

export type SkillAuthoringIssueSeverity = 'error' | 'warning';

export type SkillAuthoringIssueCode =
	| 'duplicate_skill_id'
	| 'missing_parent'
	| 'missing_child_depth'
	| 'invalid_root_depth'
	| 'invalid_child_depth'
	| 'parent_cycle'
	| 'duplicate_linked_resource_id'
	| 'linked_resource_without_load_rule'
	| 'linked_resource_self_reference'
	| 'unsafe_reference_path'
	| 'oversized_root_skill'
	// Block-ontology linter (skill-update-refactor-tasker.md §6.2, §12.1, §12.2)
	| 'invalid_frontmatter'
	| 'pending_migration_invalid_skill_type'
	| 'migrated_requires_preserve_markdown'
	| 'migrated_missing_frontmatter'
	| 'unknown_block'
	| 'duplicate_block'
	| 'blocks_out_of_order'
	| 'missing_required_block'
	| 'forbidden_block_present'
	| 'orchestration_missing_routing'
	| 'orphan_dependency'
	| 'dangling_route'
	| 'missing_provenance_tag';

export type SkillAuthoringIssue = {
	severity: SkillAuthoringIssueSeverity;
	code: SkillAuthoringIssueCode;
	skillId: string;
	message: string;
	relatedId?: string;
};

export type SkillAuthoringValidationOptions = {
	rootLineWarningThreshold?: number;
};

const DEFAULT_ROOT_LINE_WARNING_THRESHOLD = 150;

function createIssue(issue: SkillAuthoringIssue): SkillAuthoringIssue {
	return issue;
}

function getSkillDepth(skill: SkillDefinition): number {
	return typeof skill.depth === 'number' ? skill.depth : 0;
}

function isUnsafeReferencePath(path: string): boolean {
	if (path.startsWith('/') || path.startsWith('\\')) return true;
	if (!path.endsWith('.md')) return true;
	const parts = path.split(/[\\/]+/).filter((part) => part.length > 0);
	return parts.includes('..') || parts[0] !== 'references';
}

function validateLinkedResources(
	skill: SkillDefinition,
	kind: 'child_skills' | 'reference_modules',
	resources: SkillLinkedResource[] | undefined,
	issues: SkillAuthoringIssue[]
): void {
	if (!resources?.length) return;

	const seenIds = new Set<string>();

	for (const resource of resources) {
		if (seenIds.has(resource.id)) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'duplicate_linked_resource_id',
					skillId: skill.id,
					relatedId: resource.id,
					message: `Skill "${skill.id}" declares duplicate ${kind} handle "${resource.id}".`
				})
			);
		}
		seenIds.add(resource.id);

		if (resource.id === skill.id) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'linked_resource_self_reference',
					skillId: skill.id,
					relatedId: resource.id,
					message: `Skill "${skill.id}" cannot link to itself as a ${kind} handle.`
				})
			);
		}

		if (resource.whenToLoad.length === 0) {
			issues.push(
				createIssue({
					severity: 'warning',
					code: 'linked_resource_without_load_rule',
					skillId: skill.id,
					relatedId: resource.id,
					message: `Skill "${skill.id}" declares ${kind} handle "${resource.id}" without when_to_load guidance.`
				})
			);
		}

		if (kind === 'reference_modules') {
			if (!resource.path || isUnsafeReferencePath(resource.path)) {
				issues.push(
					createIssue({
						severity: 'error',
						code: 'unsafe_reference_path',
						skillId: skill.id,
						relatedId: resource.id,
						message: `Reference module "${resource.id}" must use a safe references/*.md path.`
					})
				);
			}
		}
	}
}

function validateParentCycles(
	skill: SkillDefinition,
	skillsById: Map<string, SkillDefinition>,
	issues: SkillAuthoringIssue[]
): void {
	const visited = new Set<string>();
	let current: SkillDefinition | undefined = skill;

	while (current?.parentId) {
		if (visited.has(current.id)) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'parent_cycle',
					skillId: skill.id,
					relatedId: current.id,
					message: `Skill "${skill.id}" has a cyclic parent chain through "${current.id}".`
				})
			);
			return;
		}

		visited.add(current.id);
		current = skillsById.get(current.parentId);
	}
}

// ---------------------------------------------------------------------------
// Block-ontology linter (skill-update-refactor-tasker.md §3.2, §3.3, §6.2, §12)
// ---------------------------------------------------------------------------

// Canonical block order (§3.2 + §12.2). Related Tools + Examples are OPTIONAL and loader-coupled.
const CANONICAL_BLOCKS = [
	'identity',
	'activation',
	'judgment',
	'procedure',
	'routing',
	'contract',
	'policy',
	'knowledge',
	'related tools',
	'examples',
	'provenance'
] as const;

type CanonicalBlock = (typeof CANONICAL_BLOCKS)[number];

const CANONICAL_ORDER: Record<CanonicalBlock, number> = CANONICAL_BLOCKS.reduce(
	(acc, block, index) => {
		acc[block] = index;
		return acc;
	},
	{} as Record<CanonicalBlock, number>
);

// 'Worked Example' normalizes to Examples (§12.2).
function normalizeBlockHeading(heading: string): string {
	const lower = heading.trim().toLowerCase();
	if (lower === 'worked example' || lower === 'worked examples') return 'examples';
	return lower;
}

// Required-by-type matrix (§3.3). 'R' = required, '.' = optional, 'X' = forbidden.
// Related Tools + Examples are optional for every type (§12.2) so they are omitted here
// (absence from this table == always optional).
type MatrixCell = 'R' | '.' | 'X';
const REQUIRED_MATRIX: Record<
	Exclude<CanonicalBlock, 'related tools' | 'examples'>,
	Record<SkillType, MatrixCell>
> = {
	identity: {
		procedure: 'R',
		strategy: 'R',
		reference: 'R',
		resource: 'R',
		policy: 'R',
		orchestration: 'R'
	},
	activation: {
		procedure: 'R',
		strategy: 'R',
		reference: 'R',
		resource: 'R',
		policy: 'R',
		orchestration: 'R'
	},
	judgment: {
		procedure: '.',
		strategy: 'R',
		reference: 'X',
		resource: '.',
		policy: '.',
		orchestration: 'R'
	},
	procedure: {
		procedure: 'R',
		strategy: '.',
		reference: 'X',
		resource: '.',
		policy: 'X',
		orchestration: 'R'
	},
	routing: {
		procedure: '.',
		strategy: '.',
		reference: 'X',
		resource: 'X',
		policy: 'X',
		orchestration: 'R'
	},
	contract: {
		procedure: 'R',
		strategy: '.',
		reference: '.',
		resource: 'R',
		policy: '.',
		orchestration: 'R'
	},
	policy: {
		procedure: '.',
		strategy: '.',
		reference: '.',
		resource: '.',
		policy: 'R',
		orchestration: '.'
	},
	knowledge: {
		procedure: '.',
		strategy: '.',
		reference: 'R',
		resource: '.',
		policy: '.',
		orchestration: '.'
	},
	provenance: {
		procedure: '.',
		strategy: '.',
		reference: 'R',
		resource: '.',
		policy: '.',
		orchestration: '.'
	}
};

type ParsedSkillBlock = {
	heading: string; // normalized (lowercased, Worked Example folded)
	rawHeading: string;
	lines: string[];
};

type ParsedSkillMarkdown = {
	frontmatterSource: string;
	frontmatter: unknown;
	blocks: ParsedSkillBlock[];
};

// Split raw SKILL.md into frontmatter + ordered H2 blocks. Returns null if no frontmatter fence.
function parseSkillMarkdown(markdown: string): ParsedSkillMarkdown | null {
	const trimmed = markdown.trim();
	const match = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
	if (!match || typeof match[1] !== 'string') return null;

	const frontmatterSource = match[1];
	let frontmatter: unknown;
	try {
		frontmatter = parseYaml(frontmatterSource);
	} catch {
		frontmatter = { __parse_error: true };
	}

	const body = trimmed.slice(match[0].length);
	const blocks: ParsedSkillBlock[] = [];
	let current: ParsedSkillBlock | null = null;
	let inFence = false;

	for (const line of body.split(/\r?\n/)) {
		if (/^\s*```/.test(line)) inFence = !inFence;
		const headingMatch = !inFence ? line.match(/^##\s+(.+?)\s*$/) : null;
		if (headingMatch && typeof headingMatch[1] === 'string') {
			current = {
				heading: normalizeBlockHeading(headingMatch[1]),
				rawHeading: headingMatch[1].trim(),
				lines: []
			};
			blocks.push(current);
			continue;
		}
		if (current) current.lines.push(line);
	}

	return { frontmatterSource, frontmatter, blocks };
}

// A skill is "migrated" iff its body carries a `## Identity` H2 (§12.1) — skill_type alone
// does NOT mean migrated.
function hasIdentityBlock(blocks: ParsedSkillBlock[]): boolean {
	return blocks.some((block) => block.heading === 'identity');
}

// Pull every "-> <id>" / "→ <id>" routing marker out of the Procedure block (§3.2, §6.2).
function extractProcedureRoutes(blocks: ParsedSkillBlock[]): Set<string> {
	const routes = new Set<string>();
	const procedure = blocks.find((block) => block.heading === 'procedure');
	if (!procedure) return routes;
	// A route marker is an arrow (-> or →) immediately followed by a backticked skill id, e.g.
	// "→ `hook_craft_short_form`" (matches the golden reference). Requiring backticks disambiguates
	// real routes from prose arrows like "per Judgment → Sharing psychology".
	const markerRe = /(?:->|→)\s*`([a-z0-9][a-z0-9_.-]*)`/gi;
	for (const line of procedure.lines) {
		let m: RegExpExecArray | null;
		while ((m = markerRe.exec(line)) !== null) {
			if (m[1]) routes.add(m[1]);
		}
	}
	return routes;
}

// Pull every backticked skill id out of the Routing block. A dynamic-dispatch orchestrator
// (e.g. build_quality_ui_ux: "choose 1-3 child lenses per surface") enumerates its children in
// the Routing table rather than with a Procedure step each, so a dependency referenced only in
// Routing is still reconciled — not an orphan (§6.2, refined 2026-07-01).
function extractRoutingBlockIds(blocks: ParsedSkillBlock[]): Set<string> {
	const ids = new Set<string>();
	const routing = blocks.find((block) => block.heading === 'routing');
	if (!routing) return ids;
	const idRe = /`([a-z0-9][a-z0-9_.-]*)`/gi;
	for (const line of routing.lines) {
		let m: RegExpExecArray | null;
		while ((m = idRe.exec(line)) !== null) {
			if (m[1]) ids.add(m[1]);
		}
	}
	return ids;
}

function isTaggedClaimLine(line: string): boolean {
	return PROVENANCE_CONFIDENCE_TAGS.some((tag) => line.includes(tag));
}

function isAuditLine(line: string): boolean {
	return PROVENANCE_AUDIT_MARKERS.some((marker) => line.includes(marker));
}

// A "claim line" (for provenance enforcement) is a substantive prose assertion: a bullet/numbered
// list item, or a paragraph line ending in sentence punctuation. Structural lines (headings,
// blockquotes = narrative/audit, tables, code, comments, rules) are exempt. See §6.2 + §11(5).
function isClaimLine(line: string, inFence: boolean): boolean {
	if (inFence) return false;
	const trimmed = line.trim();
	if (trimmed.length === 0) return false;
	if (trimmed.startsWith('#')) return false; // heading
	if (trimmed.startsWith('>')) return false; // blockquote — narrative / audit trail
	if (trimmed.startsWith('|')) return false; // table row
	if (trimmed.startsWith('<!--') || trimmed.startsWith('-->')) return false; // html comment
	if (/^[-*_]{3,}$/.test(trimmed)) return false; // horizontal rule
	if (/^```/.test(trimmed)) return false; // fence marker

	const listItem = /^\s*(?:[-*]|\d+[.)])\s+/.test(line);
	const sentence = /[.!?]["'`)*_]*$/.test(trimmed);
	return listItem || sentence;
}

/**
 * Provenance-tag linter for a single reference module. Runs ONLY when the module's frontmatter
 * sets `provenance_required: true` (§6.2). Every claim line must carry one of the three confidence
 * tags, unless it is part of an explicit REMOVED/CORRECTED audit annotation.
 */
export function validateReferenceModuleProvenance(
	moduleId: string,
	rawContent: string
): SkillAuthoringIssue[] {
	const issues: SkillAuthoringIssue[] = [];
	const trimmed = rawContent.replace(/^﻿/, '').trimStart();
	const fenceMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
	if (!fenceMatch || typeof fenceMatch[1] !== 'string') return issues;

	let frontmatter: unknown;
	try {
		frontmatter = parseYaml(fenceMatch[1]);
	} catch {
		return issues;
	}

	const parsed = referenceModuleFrontmatterSchema.safeParse(frontmatter);
	if (!parsed.success) {
		issues.push(
			createIssue({
				severity: 'error',
				code: 'invalid_frontmatter',
				skillId: moduleId,
				message: `Reference module "${moduleId}" has invalid frontmatter: ${parsed.error.issues
					.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
					.join('; ')}.`
			})
		);
		return issues;
	}

	if (parsed.data.provenance_required !== true) return issues;

	const body = trimmed.slice(fenceMatch[0].length);
	let inFence = false;
	let lineNo = 0;
	for (const line of body.split(/\r?\n/)) {
		lineNo += 1;
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (!isClaimLine(line, inFence)) continue;
		if (isAuditLine(line)) continue;
		if (isTaggedClaimLine(line)) continue;
		issues.push(
			createIssue({
				severity: 'error',
				code: 'missing_provenance_tag',
				skillId: moduleId,
				message: `Reference module "${moduleId}" (provenance_required) has an untagged claim near line ${lineNo}: "${line.trim().slice(0, 80)}".`
			})
		);
	}

	return issues;
}

function validateSkillBlockOntologyForSkill(
	skill: SkillDefinition,
	issues: SkillAuthoringIssue[]
): void {
	const markdown = skill.rawMarkdown;
	// Programmatic (non-markdown) skills have no frontmatter/body to lint.
	if (typeof markdown !== 'string' || markdown.trim().length === 0) return;

	const parsed = parseSkillMarkdown(markdown);
	if (!parsed) return;

	// 1) Frontmatter Zod check — runs on ALL skills that have frontmatter, migrated or pending.
	//    Pending skills currently carry a legacy `skill_type: combo` sentinel that is NOT one of the
	//    canonical six; we surface that as a warning (not an error) so CI stays green while skills
	//    migrate one at a time (§12.1). Any OTHER frontmatter defect is a hard error.
	const fmResult = skillFrontmatterSchema.safeParse(parsed.frontmatter);
	const migrated = hasIdentityBlock(parsed.blocks);

	if (!fmResult.success) {
		const onlyInvalidSkillType =
			!migrated &&
			fmResult.error.issues.every(
				(issue) => issue.path.length === 1 && issue.path[0] === 'skill_type'
			);
		issues.push(
			createIssue({
				severity: onlyInvalidSkillType ? 'warning' : 'error',
				code: onlyInvalidSkillType
					? 'pending_migration_invalid_skill_type'
					: 'invalid_frontmatter',
				skillId: skill.id,
				message: `Skill "${skill.id}" frontmatter: ${fmResult.error.issues
					.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
					.join('; ')}.`
			})
		);
	}

	// 2) Structural block-ontology checks run ONLY on migrated skills (gated on `## Identity`, §12.1).
	if (!migrated) return;

	const fm = fmResult.success ? fmResult.data : undefined;
	const skillType = fm?.skill_type;

	// Migrated skills must declare the full frontmatter trio (§3.1).
	const missingFm: string[] = [];
	if (!fm?.skill_type) missingFm.push('skill_type');
	if (!fm?.altitude) missingFm.push('altitude');
	if (!fm?.activation) missingFm.push('activation');
	// Migrated skills MUST be preserve_markdown: the new blocks (Identity/Judgment/Routing/Knowledge)
	// have no structured-field equivalent, so renderSkillMarkdown would silently drop them — only the
	// raw-body path (renderPreservedSkillMarkdown) surfaces them to the model (§8.5).
	if (fm?.preserve_markdown !== true) {
		issues.push(
			createIssue({
				severity: 'error',
				code: 'migrated_requires_preserve_markdown',
				skillId: skill.id,
				message: `Migrated skill "${skill.id}" must set preserve_markdown: true — its canonical blocks are only served via the raw-body render path.`
			})
		);
	}

	if (missingFm.length > 0) {
		issues.push(
			createIssue({
				severity: 'error',
				code: 'migrated_missing_frontmatter',
				skillId: skill.id,
				message: `Migrated skill "${skill.id}" is missing required frontmatter: ${missingFm.join(', ')}.`
			})
		);
	}

	// 2a) Every H2 must be in the canonical menu, appear once, and be in canonical order.
	const seen = new Set<string>();
	let lastOrder = -1;
	for (const block of parsed.blocks) {
		const canonicalIndex = CANONICAL_ORDER[block.heading as CanonicalBlock];
		if (canonicalIndex === undefined) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'unknown_block',
					skillId: skill.id,
					message: `Skill "${skill.id}" declares block "## ${block.rawHeading}" which is not in the canonical menu.`
				})
			);
			continue;
		}
		if (seen.has(block.heading)) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'duplicate_block',
					skillId: skill.id,
					message: `Skill "${skill.id}" declares block "## ${block.rawHeading}" more than once.`
				})
			);
			continue;
		}
		seen.add(block.heading);
		if (canonicalIndex < lastOrder) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'blocks_out_of_order',
					skillId: skill.id,
					message: `Skill "${skill.id}" block "## ${block.rawHeading}" is out of canonical order.`
				})
			);
		}
		lastOrder = Math.max(lastOrder, canonicalIndex);
	}

	// 2b) Required-by-type matrix (§3.3). Needs a valid skill_type.
	if (skillType) {
		for (const block of Object.keys(REQUIRED_MATRIX) as Array<keyof typeof REQUIRED_MATRIX>) {
			const cell = REQUIRED_MATRIX[block][skillType];
			const present = seen.has(block);
			if (cell === 'R' && !present) {
				issues.push(
					createIssue({
						severity: 'error',
						code: 'missing_required_block',
						skillId: skill.id,
						message: `Skill "${skill.id}" (${skillType}) is missing required block "## ${titleCaseBlock(block)}".`
					})
				);
			} else if (cell === 'X' && present) {
				issues.push(
					createIssue({
						severity: 'error',
						code: 'forbidden_block_present',
						skillId: skill.id,
						message: `Skill "${skill.id}" (${skillType}) must not declare block "## ${titleCaseBlock(block)}".`
					})
				);
			}
		}
	}

	// 2c) Orchestration route <-> dependency reconciliation (§6.2).
	if (skillType === 'orchestration') {
		if (!seen.has('routing')) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'orchestration_missing_routing',
					skillId: skill.id,
					message: `Orchestration skill "${skill.id}" must declare a "## Routing" block.`
				})
			);
		}
		const dependencyIds = new Set(
			(Array.isArray(fm?.dependencies) ? fm!.dependencies : []).map((dep) => dep.id)
		);
		const routes = extractProcedureRoutes(parsed.blocks);
		const routingIds = extractRoutingBlockIds(parsed.blocks);
		for (const routeId of routes) {
			if (!dependencyIds.has(routeId)) {
				issues.push(
					createIssue({
						severity: 'error',
						code: 'dangling_route',
						skillId: skill.id,
						relatedId: routeId,
						message: `Skill "${skill.id}" Procedure routes to "${routeId}" with no matching dependencies entry.`
					})
				);
			}
		}
		// A dependency is reconciled if referenced by a Procedure route marker OR listed in the
		// Routing block (covers static pipelines and dynamic-dispatch orchestrators alike).
		for (const dependencyId of dependencyIds) {
			if (!routes.has(dependencyId) && !routingIds.has(dependencyId)) {
				issues.push(
					createIssue({
						severity: 'error',
						code: 'orphan_dependency',
						skillId: skill.id,
						relatedId: dependencyId,
						message: `Skill "${skill.id}" declares dependency "${dependencyId}" that neither a Procedure route marker nor the Routing block references.`
					})
				);
			}
		}
	}
}

function titleCaseBlock(block: string): string {
	return block
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

export function validateSkillBlockOntology(skills: SkillDefinition[]): SkillAuthoringIssue[] {
	const issues: SkillAuthoringIssue[] = [];
	for (const skill of skills) {
		validateSkillBlockOntologyForSkill(skill, issues);
	}
	return issues;
}

export function validateSkillAuthoring(
	skills: SkillDefinition[],
	options: SkillAuthoringValidationOptions = {}
): SkillAuthoringIssue[] {
	const issues: SkillAuthoringIssue[] = [];
	const rootLineWarningThreshold =
		options.rootLineWarningThreshold ?? DEFAULT_ROOT_LINE_WARNING_THRESHOLD;
	const skillsById = new Map<string, SkillDefinition>();

	for (const skill of skills) {
		if (skillsById.has(skill.id)) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'duplicate_skill_id',
					skillId: skill.id,
					message: `Duplicate skill id "${skill.id}" is registered.`
				})
			);
		}
		skillsById.set(skill.id, skill);
	}

	for (const skill of skills) {
		const isChild = Boolean(skill.parentId);

		if (!isChild && typeof skill.depth === 'number' && skill.depth !== 0) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'invalid_root_depth',
					skillId: skill.id,
					message: `Root skill "${skill.id}" must not declare depth ${skill.depth}; use 0 or omit depth.`
				})
			);
		}

		if (isChild) {
			const parent = skillsById.get(skill.parentId as string);

			if (!parent) {
				issues.push(
					createIssue({
						severity: 'error',
						code: 'missing_parent',
						skillId: skill.id,
						relatedId: skill.parentId,
						message: `Child skill "${skill.id}" references missing parent "${skill.parentId}".`
					})
				);
			}

			if (typeof skill.depth !== 'number') {
				issues.push(
					createIssue({
						severity: 'error',
						code: 'missing_child_depth',
						skillId: skill.id,
						relatedId: skill.parentId,
						message: `Child skill "${skill.id}" must declare depth.`
					})
				);
			} else if (parent) {
				const expectedDepth = getSkillDepth(parent) + 1;
				if (skill.depth !== expectedDepth) {
					issues.push(
						createIssue({
							severity: 'error',
							code: 'invalid_child_depth',
							skillId: skill.id,
							relatedId: parent.id,
							message: `Child skill "${skill.id}" has depth ${skill.depth}; expected ${expectedDepth} based on parent "${parent.id}".`
						})
					);
				}
			}
		}

		if (
			!isChild &&
			(skill.bodyLineCount ?? 0) > rootLineWarningThreshold &&
			!skill.childSkills?.length &&
			!skill.referenceModules?.length
		) {
			issues.push(
				createIssue({
					severity: 'warning',
					code: 'oversized_root_skill',
					skillId: skill.id,
					message: `Root skill "${skill.id}" is ${skill.bodyLineCount} lines without child skills or reference modules. Consider splitting niche or high-context material.`
				})
			);
		}

		validateLinkedResources(skill, 'child_skills', skill.childSkills, issues);
		validateLinkedResources(skill, 'reference_modules', skill.referenceModules, issues);
		validateParentCycles(skill, skillsById, issues);
		validateSkillBlockOntologyForSkill(skill, issues);
	}

	return issues.sort((a, b) => {
		const severityOrder = a.severity.localeCompare(b.severity);
		if (severityOrder !== 0) return severityOrder;
		const skillOrder = a.skillId.localeCompare(b.skillId);
		if (skillOrder !== 0) return skillOrder;
		return a.code.localeCompare(b.code);
	});
}
