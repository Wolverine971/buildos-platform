// apps/web/src/lib/services/agentic-chat/tools/skills/project-create.skill.ts
import type { SkillDefinition } from './types';

export const projectCreateSkill: SkillDefinition = {
	path: 'onto.project.create.skill',
	id: 'project_create',
	name: 'project create',
	summary:
		'Project creation playbook for turning a user idea into the smallest valid BuildOS project payload with inferred name, type_key, props, and only the initial structure the user actually described.',
	relatedOps: ['onto.project.create'],
	whenToUse: [
		'The chat is in project_create mode',
		'The user wants to start a new project from scratch',
		'You need to infer project name, type_key, and a minimal initial graph from a rough idea'
	],
	workflow: [
		'Start from the smallest valid project payload: project { name, type_key }, entities: [], relationships: [].',
		'Infer project.name from the user message when it is reasonably clear. Do not ask for the name if the user already implied it.',
		'Infer project.type_key using the project.{realm}.{domain}[.{variant}] pattern. Pick the simplest accurate classification.',
		'Extract concrete details into project.description and project.props when the user provided them. Do not leave props empty when clear attributes were stated.',
		'If the user stated an outcome, add one goal entity. If the user listed concrete actions, add only those task entities. Add plans or milestones only when the user clearly described phases, workstreams, or date-driven structure.',
		'Always include entities and relationships arrays, even when they are empty.',
		'When you include relationships, each relationship item must use entity refs with temp_id and kind. Valid forms are [ { temp_id, kind }, { temp_id, kind } ] or { from: { temp_id, kind }, to: { temp_id, kind } }.',
		'Use clarifications[] only when critical information cannot be reasonably inferred. If clarification is needed, still send the project skeleton instead of abandoning the create call.',
		'After creation succeeds, summarize the new project briefly and continue in the created project context.'
	],
	guardrails: [
		'Do not call onto.project.create with args:{}.',
		'Do not omit project, entities, or relationships from the payload.',
		'Do not leave project.name or project.type_key blank when they can be inferred from the user message.',
		'Do not add goals, plans, milestones, risks, or documents the user did not mention.',
		'Do not encode relationships as raw temp_id strings like ["g1", "t1"]. Include temp_id and kind for both sides.',
		'Do not over-structure a new project just because the schema allows it.'
	],
	examples: [
		{
			description: 'Create a minimal project from a brief idea',
			next_steps: [
				'Infer the project name and type_key from the message.',
				'Call onto.project.create with project plus empty entities and relationships arrays.',
				'Only ask a clarifying question if the request is too vague to classify at all.'
			]
		},
		{
			description: 'Create a project with one outcome and a few explicit actions',
			next_steps: [
				'Add one goal when the user stated the outcome explicitly.',
				'Add task entities only for concrete actions the user actually mentioned.',
				'Link the goal to those tasks only when the relationship is already clear from the request.'
			]
		},
		{
			description: 'Handle missing critical information without stalling',
			next_steps: [
				'If the user gave enough signal to classify the project, still send the project skeleton.',
				'Use clarifications[] for only the missing critical points.',
				'Do not wait for perfect detail before creating the project.'
			]
		}
	],
	notes: [
		'Project creation is a minimality exercise. Good first payloads are usually smaller than the model expects.',
		'The most common failure is omitting entities and relationships or leaving project fields empty after the user already provided enough context.'
	]
};
