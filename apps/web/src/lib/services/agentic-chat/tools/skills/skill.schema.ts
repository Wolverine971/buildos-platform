// apps/web/src/lib/services/agentic-chat/tools/skills/skill.schema.ts
//
// Canonical SKILL.md frontmatter contract.
// This module owns the *frontmatter* half of the build-time skill-ontology validator; the body
// block linter lives in ./skill-authoring-validation.ts. Keep the two in lockstep.
//
// Design rules honored here:
//   - Enums for skill_type / altitude / activation carry the six/three/three canonical values.
//   - `dependencies` is optional in general, but REQUIRED (non-empty) for orchestration skills.
//   - `reference_modules` shape is validated where present.
//   - Every pre-existing frontmatter key is ALLOWED (passthrough): parent_id, depth,
//     preserve_markdown, legacy_paths, path, child_skills, reference_modules, name, description.
//     We only assert the typed keys; unknown keys are never rejected.
import { z } from 'zod';

export const SKILL_TYPES = [
	'procedure',
	'strategy',
	'reference',
	'resource',
	'policy',
	'orchestration'
] as const;
export type SkillType = (typeof SKILL_TYPES)[number];

export const ALTITUDES = ['task', 'domain', 'meta'] as const;
export type SkillAltitude = (typeof ALTITUDES)[number];

export const ACTIVATIONS = ['always_on', 'progressive', 'invoked'] as const;
export type SkillActivation = (typeof ACTIVATIONS)[number];

export const skillTypeSchema = z.enum(SKILL_TYPES);
export const altitudeSchema = z.enum(ALTITUDES);
export const activationSchema = z.enum(ACTIVATIONS);

/** Machine-readable routing entry: which sibling skill owns what (§3.1). */
export const skillDependencySchema = z.object({
	id: z.string().min(1),
	owns: z.string().min(1)
});
export type SkillDependency = z.infer<typeof skillDependencySchema>;

/**
 * reference_modules shape (existing, unchanged — §3.1). Only the typed fields are asserted;
 * anything else on a module entry is allowed through so future metadata never breaks the build.
 */
export const referenceModuleSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().optional(),
		summary: z.string().optional(),
		when_to_load: z.array(z.string()).optional(),
		whenToLoad: z.array(z.string()).optional(),
		path: z.string().optional(),
		visibility: z.enum(['public', 'internal']).optional()
	})
	.passthrough();

/**
 * The full frontmatter contract. `skill_type` / `altitude` / `activation` are optional at the
 * schema level so that pending (un-migrated) skills carrying only a partial set still validate on
 * whatever typed keys they DO declare (§12.1). The linter separately requires the full trio once a
 * skill is migrated (has a `## Identity` block).
 *
 * The `.superRefine` enforces §6.1: an orchestration skill MUST declare non-empty `dependencies`.
 */
export const skillFrontmatterSchema = z
	.object({
		name: z.string().min(1),
		description: z.string().min(1),
		skill_type: skillTypeSchema.optional(),
		altitude: altitudeSchema.optional(),
		activation: activationSchema.optional(),
		dependencies: z.array(skillDependencySchema).optional(),
		parent_id: z.union([z.string(), z.null()]).optional(),
		depth: z.number().optional(),
		preserve_markdown: z.boolean().optional(),
		legacy_paths: z.array(z.string()).optional(),
		path: z.string().optional(),
		child_skills: z.array(z.any()).optional(),
		reference_modules: z.array(referenceModuleSchema).optional()
	})
	.passthrough()
	.superRefine((fm, ctx) => {
		if (fm.skill_type === 'orchestration') {
			if (!Array.isArray(fm.dependencies) || fm.dependencies.length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['dependencies'],
					message: 'orchestration skills must declare non-empty dependencies'
				});
			}
		}
	});

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

/**
 * Lightweight reference-module frontmatter (§8.2 / decision #3). Present only on modules that opt
 * in; the loader strips it before serving. `provenance_required` is the crown-jewel hook (§2.5):
 * when true, the body linter asserts every claim line in that module carries a source tag.
 */
export const referenceModuleFrontmatterSchema = z
	.object({
		reference_id: z.string().min(1),
		parent_skill: z.string().min(1),
		provenance_required: z.boolean().optional(),
		updated: z.union([z.string(), z.date()]).optional()
	})
	.passthrough();

export type ReferenceModuleFrontmatter = z.infer<typeof referenceModuleFrontmatterSchema>;

/** Closed provenance vocabulary (§11 decision 5). Three confidence tags + two audit markers. */
export const PROVENANCE_CONFIDENCE_TAGS = ['PRIMARY', 'practitioner', 'internal-default'] as const;
export const PROVENANCE_AUDIT_MARKERS = ['REMOVED', 'CORRECTED'] as const;
