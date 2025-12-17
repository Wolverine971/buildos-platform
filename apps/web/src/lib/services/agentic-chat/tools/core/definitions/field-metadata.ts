// apps/web/src/lib/services/agentic-chat/tools/core/definitions/field-metadata.ts
/**
 * Entity Field Metadata
 *
 * Curated field information for entities, providing the LLM with authoritative
 * information about field types, valid values, and descriptions.
 */

import type { FieldInfo } from './types';

export const ENTITY_FIELD_INFO: Record<string, Record<string, FieldInfo>> = {
	ontology_project: {
		name: {
			type: 'string',
			description: 'Human-readable project name stored in onto_projects.name',
			required: true,
			example: 'AI Knowledge Base Launch'
		},
		type_key: {
			type: 'string',
			description:
				'Type classification following project.{realm}.{deliverable}[.{variant}] pattern',
			required: true,
			example: 'project.creative.book'
		},
		state_key: {
			type: 'enum',
			enum_values: ['planning', 'active', 'completed', 'cancelled'],
			description:
				'Lifecycle state for the ontology project (planning -> active -> completed, or cancelled)',
			required: true,
			example: 'planning'
		},
		description: {
			type: 'string',
			description: 'Narrative description of the work being done',
			required: false,
			example: 'Launch a structured AI knowledge base for the company.'
		},
		facet_context: {
			type: 'enum',
			enum_values: [
				'personal',
				'client',
				'commercial',
				'internal',
				'open_source',
				'community',
				'academic',
				'nonprofit',
				'startup'
			],
			description: 'Context facet derived from props.facets.context',
			required: false,
			example: 'client'
		},
		facet_scale: {
			type: 'enum',
			enum_values: ['micro', 'small', 'medium', 'large', 'epic'],
			description: 'Scale facet derived from props.facets.scale',
			required: false,
			example: 'medium'
		},
		facet_stage: {
			type: 'enum',
			enum_values: [
				'discovery',
				'planning',
				'execution',
				'launch',
				'maintenance',
				'complete'
			],
			description: 'Stage facet derived from props.facets.stage',
			required: false,
			example: 'execution'
		},
		props: {
			type: 'string',
			description:
				'JSON properties blob for custom metadata (store as JSON string when updating)',
			required: false,
			example: '{"facets":{"context":"client","scale":"medium"}}'
		},
		start_at: {
			type: 'date',
			description: 'Optional ISO timestamp indicating project start',
			required: false,
			example: '2025-11-10T00:00:00Z'
		},
		end_at: {
			type: 'date',
			description: 'Optional ISO timestamp indicating target completion',
			required: false,
			example: '2026-01-15T00:00:00Z'
		}
	},
	ontology_task: {
		title: {
			type: 'string',
			description: 'Task title stored in onto_tasks.title',
			required: true,
			example: 'Draft onboarding email sequence'
		},
		state_key: {
			type: 'enum',
			enum_values: ['todo', 'in_progress', 'blocked', 'done'],
			description: 'Execution state for the task',
			required: true,
			example: 'in_progress'
		},
		priority: {
			type: 'number',
			description: 'Optional numeric priority (1-5). Higher numbers mean more important.',
			required: false,
			example: '4'
		},
		due_at: {
			type: 'date',
			description: 'Optional deadline timestamp',
			required: false,
			example: '2025-12-01T15:00:00Z'
		},
		plan_id: {
			type: 'string',
			description:
				'Optional plan UUID (INPUT ONLY - not a database column). When provided during task creation/update, creates edge relationships in onto_edges table (task->plan with rel=belongs_to_plan). Query task-plan relationships via onto_edges, not directly on onto_tasks.',
			required: false,
			example: '9a9c0d90-736f-4a2b-8ac0-1234567890ab'
		},
		type_key: {
			type: 'string',
			description: `Task work mode taxonomy. Format: task.{work_mode}[.{specialization}]
Work modes: execute (default), create, refine, research, review, coordinate, admin, plan.
Specializations: task.coordinate.meeting, task.coordinate.standup, task.execute.deploy, task.execute.checklist.
Use the most specific type that matches the task nature.`,
			required: false,
			example: 'task.execute'
		},
		props: {
			type: 'string',
			description: 'JSON metadata. Use props.description for detailed task brief.',
			required: false,
			example: '{"description":"Summarize beta feedback before final email"}'
		}
	},
	ontology_plan: {
		name: {
			type: 'string',
			description: 'Plan name stored in onto_plans.name',
			required: true,
			example: 'Q1 Development Sprint'
		},
		type_key: {
			type: 'string',
			description: `Plan type taxonomy. Format: plan.{family}[.{variant}]
Families: timebox (sprints, weekly), pipeline (sales, content), campaign (marketing), roadmap (product), process (onboarding), phase (project phases).
Examples: plan.timebox.sprint, plan.pipeline.sales, plan.phase.project`,
			required: true,
			example: 'plan.timebox.sprint'
		},
		state_key: {
			type: 'enum',
			enum_values: ['draft', 'active', 'completed'],
			description: 'Execution state for the plan (draft -> active -> completed)',
			required: true,
			example: 'active'
		},
		props: {
			type: 'string',
			description: 'Plan metadata JSON (object stored as string when updating)',
			required: false,
			example: '{"facets":{"stage":"planning"}}'
		}
	},
	ontology_goal: {
		name: {
			type: 'string',
			description: 'Goal title stored in onto_goals.name',
			required: true,
			example: 'Reach $50K MRR by Q2'
		},
		type_key: {
			type: 'string',
			description: `Goal type taxonomy. Format: goal.{family}[.{variant}]
Families: outcome (binary completion), metric (quantitative), behavior (frequency), learning (skill progression).
Examples: goal.outcome.project, goal.metric.revenue, goal.behavior.cadence, goal.learning.skill`,
			required: false,
			example: 'goal.metric.revenue'
		},
		props: {
			type: 'string',
			description: 'Goal metadata (JSON stored in props)',
			required: false,
			example: '{"metrics":{"target":50000,"unit":"USD"}}'
		}
	}
};
