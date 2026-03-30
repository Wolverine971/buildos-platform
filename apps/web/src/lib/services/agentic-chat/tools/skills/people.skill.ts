// apps/web/src/lib/services/agentic-chat/tools/skills/people.skill.ts
import type { SkillDefinition } from './types';

export const peopleSkill: SkillDefinition = {
	path: 'util.people.skill',
	id: 'people',
	name: 'people',
	summary:
		'People context playbook for profile lookup, contact search and updates, candidate resolution, and safe handling of sensitive contact values.',
	relatedOps: [
		'util.profile.overview',
		'util.contact.search',
		'util.contact.upsert',
		'util.contact.candidates.list',
		'util.contact.candidate.resolve',
		'util.contact.link'
	],
	whenToUse: [
		'Use user profile context when personalization matters',
		'Look up a person or contact record',
		'Create or update contact details',
		'Resolve duplicate or ambiguous contact candidates',
		'Link a person/contact record to another entity safely'
	],
	workflow: [
		'Decide whether you need profile context, a contact lookup, a candidate-resolution workflow, or an entity link.',
		'Use util.profile.overview only when personalization or user context materially matters; profile data is not preloaded.',
		'For people lookups, search first and inspect the returned matches before writing anything.',
		'If identity is uncertain or duplicates exist, use the contact candidate tools before assuming records should merge.',
		'Only request raw phone or email values when the user explicitly asks for exact details.',
		'For contact linking, choose the link type first, then pass exact target IDs.',
		'For candidate resolution, only use confirmed merge actions when the user has clearly confirmed the records represent the same person.',
		'After execution, explain what was found or changed and note when sensitive values were intentionally withheld.'
	],
	guardrails: [
		'Do not assume two records are the same person based only on name similarity.',
		'Contact values are redacted by default; do not request sensitive values unless the user explicitly wants them.',
		'Do not use confirmed merge actions without explicit user confirmation.',
		'Use exact IDs for contact link and candidate resolution operations.'
	],
	examples: [
		{
			description: 'Find a contact and disclose exact contact details only when asked',
			next_steps: [
				'Use util.contact.search first to find the right record.',
				'If the user wants exact email or phone data, re-run with the appropriate sensitive-value options only after confirming that need.',
				'Summarize the result and keep redaction behavior explicit.'
			]
		},
		{
			description: 'Resolve duplicate contact candidates safely',
			next_steps: [
				'Use util.contact.candidates.list to inspect likely duplicates.',
				'Ask for confirmation if the merge decision is not already explicit from the user.',
				'Use util.contact.candidate.resolve only after the intended action is clear.'
			]
		}
	],
	notes: [
		'Profile context and contact data are different surfaces: profile is about the user; contacts are about people records.',
		'People workflows often fail from overconfidence. Prefer explicit confirmation over silent merging.'
	]
};
