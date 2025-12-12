// apps/web/src/lib/services/agentic-chat/tools/core/tool-definitions.ts
/**
 * Chat Tool Definitions
 *
 * Houses the raw tool schemas plus metadata used by the chat tooling layer.
 * Context-aware orchestration lives in tools.config.ts.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

/**
 * Curated field information for entities
 * This provides the LLM with authoritative information about field types,
 * valid values, and descriptions for commonly-queried fields.
 */
export interface FieldInfo {
	type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'enum';
	description: string;
	required?: boolean;
	enum_values?: string[];
	example?: string;
}

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
			enum_values: ['draft', 'active', 'paused', 'complete', 'archived'],
			description: 'Lifecycle state for the ontology project',
			required: true,
			example: 'active'
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
			enum_values: ['draft', 'active', 'blocked', 'complete'],
			description: 'Execution state for the plan',
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

/**
 * Complete set of tools available to the chat system
 * Tools are organized by category for the progressive disclosure pattern
 */
export const CHAT_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	// ============================================
	// ONTOLOGY TOOLS (onto_* tables)
	// ============================================

	{
		type: 'function',
		function: {
			name: 'list_onto_tasks',
			description: `List tasks from the ontology system (onto_tasks table). Returns abbreviated task information including id, title, state, and type.
Use this for queries about ontology tasks, plans with tasks, or project task lists.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter tasks by project ID'
					},
					state_key: {
						type: 'string',
						description: 'Filter by state (e.g., "pending", "in_progress", "completed")'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum tasks to return'
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_onto_tasks',
			description: `Search tasks across all ontology projects using keywords. Returns concise task matches with project context.
Use when the user references a task by name or description but the project is unknown.`,
			parameters: {
				type: 'object',
				properties: {
					search: {
						type: 'string',
						description: 'Keyword to match against task titles (required)'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
					},
					state_key: {
						type: 'string',
						description: 'Filter by state (todo, in_progress, blocked, done)'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of search results'
					}
				},
				required: ['search']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'list_onto_goals',
			description: `List goals from the ontology system (onto_goals table). Returns abbreviated goal information.
Use for queries about project goals or strategic objectives.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter goals by project ID'
					},
					limit: {
						type: 'number',
						default: 10,
						maximum: 30
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'list_onto_documents',
			description: `List documents from the ontology system (onto_documents table). Returns document summaries.
Use for queries about project documentation, briefs, specs, or research artifacts.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter documents by project ID'
					},
					type_key: {
						type: 'string',
						description:
							'Filter by document type key (e.g., document.context.project, document.knowledge.research)'
					},
					state_key: {
						type: 'string',
						description: 'Filter by document state'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of documents to return'
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'list_onto_plans',
			description: `List plans from the ontology system (onto_plans table). Returns plan summaries.
Use for queries about execution plans or workflows.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter plans by project ID'
					},
					limit: {
						type: 'number',
						default: 10,
						maximum: 20
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'list_onto_projects',
			description: `List projects from the ontology system (onto_projects table). Returns abbreviated project information.
Use for discovering available projects or getting project overviews.`,
			parameters: {
				type: 'object',
				properties: {
					state_key: {
						type: 'string',
						description: 'Filter by project state'
					},
					type_key: {
						type: 'string',
						description: 'Filter by project type'
					},
					limit: {
						type: 'number',
						default: 10,
						maximum: 30
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_onto_projects',
			description: `Search ontology projects by name or description. Returns concise project matches ideal for global discovery queries.`,
			parameters: {
				type: 'object',
				properties: {
					search: {
						type: 'string',
						description: 'Keyword to search for (required)'
					},
					state_key: {
						type: 'string',
						description: 'Filter by project state'
					},
					type_key: {
						type: 'string',
						description: 'Filter by type_key classification'
					},
					limit: {
						type: 'number',
						default: 10,
						maximum: 30,
						description: 'Maximum search matches to return'
					}
				},
				required: ['search']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'search_onto_documents',
			description: `Search ontology documents by title. Returns concise matches with project_id and type/state.
Use when the user references a doc name or needs to find a brief/spec quickly.`,
			parameters: {
				type: 'object',
				properties: {
					search: {
						type: 'string',
						description: 'Keyword to search for (required)'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
					},
					type_key: {
						type: 'string',
						description: 'Filter by document type key'
					},
					state_key: {
						type: 'string',
						description: 'Filter by document state'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of search results'
					}
				},
				required: ['search']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'search_ontology',
			description: `Fuzzy search across ontology entities (tasks, plans, goals, milestones, documents, outputs, requirements). Returns typed matches with snippets so you can load details with get_onto_* tools.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search text to match across ontology entities (required)'
					},
					project_id: {
						type: 'string',
						description: 'Optional project scope to limit results'
					},
					types: {
						type: 'array',
						description: 'Optional entity type filters',
						items: {
							type: 'string',
							enum: [
								'task',
								'plan',
								'goal',
								'milestone',
								'document',
								'output',
								'requirement'
							]
						}
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of results (capped at 50)'
					}
				},
				required: ['query']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_onto_project_details',
			description: `Get complete details for a specific ontology project including properties and metadata.
Use when you need full project information after identifying it with list_onto_projects.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID to retrieve'
					}
				},
				required: ['project_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_onto_task_details',
			description: `Get complete details for a specific ontology task including all properties and relationships.
Use after identifying a task with list_onto_tasks.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task ID to retrieve'
					}
				},
				required: ['task_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_onto_goal_details',
			description: `Get complete details for a specific ontology goal including properties and metadata.
Use after listing goals to retrieve the full record for editing or auditing.`,
			parameters: {
				type: 'object',
				properties: {
					goal_id: {
						type: 'string',
						description: 'Goal ID to retrieve'
					}
				},
				required: ['goal_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_onto_plan_details',
			description: `Get complete details for a specific ontology plan including properties and metadata.
Use after listing plans to retrieve the full record for editing or auditing.`,
			parameters: {
				type: 'object',
				properties: {
					plan_id: {
						type: 'string',
						description: 'Plan ID to retrieve'
					}
				},
				required: ['plan_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_onto_document_details',
			description: `Get complete details for a specific ontology document including props/body markdown.
Use when you need the full document before editing or linking it.`,
			parameters: {
				type: 'object',
				properties: {
					document_id: {
						type: 'string',
						description: 'Document ID to retrieve'
					}
				},
				required: ['document_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'list_task_documents',
			description: `List documents linked to a specific task via task_has_document edges.
Use when you need to see the work artifacts, drafts, or scratch docs associated with a task.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task ID to retrieve documents for'
					}
				},
				required: ['task_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_entity_relationships',
			description: `Get the relationship graph for an ontology entity using onto_edges table.
Shows what entities are connected to this entity and how.`,
			parameters: {
				type: 'object',
				properties: {
					entity_id: {
						type: 'string',
						description: 'Entity ID to get relationships for'
					},
					direction: {
						type: 'string',
						enum: ['outgoing', 'incoming', 'both'],
						default: 'both',
						description: 'Direction of relationships to retrieve'
					}
				},
				required: ['entity_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_linked_entities',
			description: `Get detailed information about entities linked to a specific entity via relationships.
Use this tool when you need to:
- Understand what plans a task belongs to
- Find all tasks that support a goal
- See documents referenced by an entity
- Explore task dependencies
- Get full details including descriptions for linked entities

This returns richer information than get_entity_relationships, including entity names, states, types, and descriptions.
The initial context shows abbreviated linked entities. Use this tool to get full details.`,
			parameters: {
				type: 'object',
				properties: {
					entity_id: {
						type: 'string',
						description: 'UUID of the entity to get linked entities for'
					},
					entity_kind: {
						type: 'string',
						enum: ['task', 'plan', 'goal', 'milestone', 'document', 'output'],
						description: 'Type of the source entity'
					},
					filter_kind: {
						type: 'string',
						enum: ['task', 'plan', 'goal', 'milestone', 'document', 'output', 'all'],
						default: 'all',
						description: 'Filter to specific entity type, or "all" for everything'
					}
				},
				required: ['entity_id', 'entity_kind']
			}
		}
	},

	// ============================================
	// ONTOLOGY ACTION TOOLS (Create/Update/Delete)
	// ============================================

	// CREATE TOOLS
	{
		type: 'function',
		function: {
			name: 'create_onto_task',
			description: `Create a new task in the ontology system.
Creates a task within a project and optionally assigns it to a plan.
Automatically creates the onto_edges relationship linking task to project.

**CRITICAL: When to create tasks vs. when NOT to:**

CREATE a task when:
- The USER explicitly asks to "add a task", "create a task", "track this", or "remind me to"
- The work requires HUMAN action (decisions, phone calls, meetings, reviews, approvals)
- The work must happen OUTSIDE this conversation (external deliverables, future actions)
- The user is building a project plan and wants persistent task tracking

DO NOT create a task when:
- You (the agent) can help with the work RIGHT NOW in this conversation
- The request is for research, analysis, brainstorming, or summarizing (just do it)
- You're about to perform the action yourself (don't create then immediately complete)
- You want to appear helpful or structured (only create if the user needs to track it)
- The user is exploring ideas or asking questions (just respond helpfully)

Examples:
- "Add a task to call the client tomorrow" → CREATE (user must do this later)
- "Help me brainstorm marketing ideas" → DO NOT CREATE (help them now)
- "I need to review the design mockups" → CREATE (user action required)
- "What are my project blockers?" → DO NOT CREATE (just analyze and respond)
- "Create tasks for the launch checklist" → CREATE (explicit request)
- "Let's outline the API endpoints" → DO NOT CREATE (collaborative work you can help with)
- "Remind me to follow up with Sarah" → CREATE (future user action)

Remember: Tasks should represent FUTURE USER WORK, not a log of what you discussed or helped with.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required) - the project this task belongs to'
					},
					title: {
						type: 'string',
						description: 'Task title (required)'
					},
					description: {
						type: 'string',
						description: 'Task description (optional)'
					},
					type_key: {
						type: 'string',
						default: 'task.execute',
						description: `Work mode taxonomy: task.{work_mode}[.{specialization}].
Modes: execute (action), create (produce), refine (improve), research (investigate), review (evaluate), coordinate (sync), admin (housekeeping), plan (strategize).
Specializations: task.coordinate.meeting, task.coordinate.standup, task.execute.deploy, task.execute.checklist.
Default: task.execute`
					},
					state_key: {
						type: 'string',
						default: 'todo',
						description:
							'Initial state (default: todo). Common: todo, in_progress, done'
					},
					priority: {
						type: 'number',
						description: 'Priority level (1-5, default: 3). Higher = more important'
					},
					plan_id: {
						type: 'string',
						description: 'Optional plan UUID to associate this task with'
					},
					due_at: {
						type: 'string',
						description: 'Optional due date in ISO format (YYYY-MM-DDTHH:mm:ssZ)'
					},
					props: {
						type: 'object',
						description: 'Additional properties as JSON object'
					}
				},
				required: ['project_id', 'title']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_onto_goal',
			description: `Create a new goal in the ontology system.
Goals define project objectives and success criteria.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					},
					name: {
						type: 'string',
						description: 'Goal name (required)'
					},
					description: {
						type: 'string',
						description: 'Goal description'
					},
					type_key: {
						type: 'string',
						default: 'goal.outcome.project',
						description: `Goal type taxonomy: goal.{family}[.{variant}]
Families: outcome, metric, behavior, learning. Default: goal.outcome.project`
					},
					props: {
						type: 'object',
						description: 'Additional properties'
					}
				},
				required: ['project_id', 'name']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_onto_plan',
			description: `Create a new plan in the ontology system.
Plans are logical groupings of tasks within a project.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					},
					name: {
						type: 'string',
						description: 'Plan name (required)'
					},
					description: {
						type: 'string',
						description: 'Plan description'
					},
					type_key: {
						type: 'string',
						default: 'plan.phase.project',
						description: `Plan type taxonomy: plan.{family}[.{variant}]
Families: timebox, pipeline, campaign, roadmap, process, phase. Default: plan.phase.project`
					},
					state_key: {
						type: 'string',
						default: 'draft',
						description: 'Initial state (draft, active, complete)'
					},
					props: {
						type: 'object',
						description: 'Additional properties'
					}
				},
				required: ['project_id', 'name']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_onto_document',
			description: `Create a new document in the ontology system.
Use for briefs, specs, context docs, or research artifacts linked to a project.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					},
					title: {
						type: 'string',
						description: 'Document title (required)'
					},
					type_key: {
						type: 'string',
						description: `Document type taxonomy (required): document.{family}[.{variant}]
Families: context (project/brief), knowledge (research/brain_dump), decision (meeting_notes/rfc), spec (product/technical), reference (handbook/sop), intake (client/project).
Examples: document.context.project, document.knowledge.research, document.spec.technical`
					},
					state_key: {
						type: 'string',
						description: 'Document state (draft, active, complete)',
						default: 'draft'
					},
					body_markdown: {
						type: 'string',
						description: 'Optional markdown body content'
					},
					props: {
						type: 'object',
						description: 'Additional properties/metadata'
					}
				},
				required: ['project_id', 'title', 'type_key']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'create_task_document',
			description: `Create or attach a document to a task workspace.
Also ensures the project has_document edge exists for discovery.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task ID to link the document to'
					},
					document_id: {
						type: 'string',
						description: 'Existing document ID to attach instead of creating new'
					},
					title: {
						type: 'string',
						description: 'Document title (required if creating new)'
					},
					type_key: {
						type: 'string',
						description: 'Document type key (required if creating new)'
					},
					state_key: {
						type: 'string',
						description: 'Document state (e.g., draft, active)',
						default: 'draft'
					},
					role: {
						type: 'string',
						description: 'Edge role (e.g., deliverable, scratch)'
					},
					body_markdown: {
						type: 'string',
						description: 'Optional markdown body content'
					},
					props: {
						type: 'object',
						description: 'Additional properties/metadata'
					}
				},
				required: ['task_id']
			}
		}
	},

	// UPDATE TOOLS
	{
		type: 'function',
		function: {
			name: 'update_onto_task',
			description: `Update an existing task in the ontology system.
Can modify title, description, state, priority, plan assignment, and custom properties.
Only updates fields that are provided - omitted fields remain unchanged.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task UUID (required)'
					},
					title: {
						type: 'string',
						description: 'New task title'
					},
					description: {
						type: 'string',
						description: 'New description'
					},
					update_strategy: {
						type: 'string',
						enum: ['replace', 'append', 'merge_llm'],
						description:
							"How to apply description updates: 'replace' (default), 'append', or 'merge_llm' to intelligently merge with existing description."
					},
					merge_instructions: {
						type: 'string',
						description:
							'Optional guidance when merging description text (e.g., keep bullets, integrate notes). Used with append/merge_llm.'
					},
					type_key: {
						type: 'string',
						description:
							'Work mode taxonomy: task.{work_mode}[.{specialization}]. Modes: execute, create, refine, research, review, coordinate, admin, plan.'
					},
					state_key: {
						type: 'string',
						description: 'New state (todo, in_progress, done, blocked, etc.)'
					},
					priority: {
						type: 'number',
						description: 'New priority (1-5)'
					},
					plan_id: {
						type: 'string',
						description:
							'Assign to different plan (or null to unassign). Uses edge relationships internally.'
					},
					due_at: {
						type: 'string',
						description: 'New due date (ISO format) or null to clear'
					},
					props: {
						type: 'object',
						description: 'Properties to merge with existing props'
					}
				},
				required: ['task_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'update_onto_project',
			description: `Update an existing project in the ontology system.
Can modify name, description, state, and custom properties.
Only updates fields that are provided.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					},
					name: {
						type: 'string',
						description: 'New project name'
					},
					description: {
						type: 'string',
						description: 'New description'
					},
					update_strategy: {
						type: 'string',
						enum: ['replace', 'append', 'merge_llm'],
						description:
							"How to apply description updates: 'replace' (default), 'append', or 'merge_llm' to intelligently merge with existing description."
					},
					merge_instructions: {
						type: 'string',
						description:
							'Optional guidance when merging description text (e.g., keep metrics, integrate new notes). Used with append/merge_llm.'
					},
					state_key: {
						type: 'string',
						description: 'New state (draft, active, complete, archived)'
					},
					props: {
						type: 'object',
						description: 'Properties to merge with existing props'
					}
				},
				required: ['project_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_onto_goal',
			description: `Update an existing ontology goal.
Use for edits to goal names, descriptions, priorities, target dates, or metadata.`,
			parameters: {
				type: 'object',
				properties: {
					goal_id: {
						type: 'string',
						description: 'Goal UUID (required)'
					},
					name: {
						type: 'string',
						description: 'New goal name'
					},
					description: {
						type: 'string',
						description: 'Goal description'
					},
					update_strategy: {
						type: 'string',
						enum: ['replace', 'append', 'merge_llm'],
						description:
							"How to apply description updates: 'replace' (default), 'append', or 'merge_llm' to intelligently merge with existing description."
					},
					merge_instructions: {
						type: 'string',
						description:
							'Optional guidance when merging description text (e.g., preserve KPIs, integrate new targets). Used with append/merge_llm.'
					},
					priority: {
						type: 'number',
						description: 'Priority value for the goal'
					},
					target_date: {
						type: 'string',
						description: 'Target date (ISO timestamp)'
					},
					measurement_criteria: {
						type: 'string',
						description: 'How success is measured'
					},
					props: {
						type: 'object',
						description: 'Metadata fields to merge into goal props'
					}
				},
				required: ['goal_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_onto_plan',
			description: `Update an existing ontology plan.
Use for edits to plan names, dates, status, or metadata.`,
			parameters: {
				type: 'object',
				properties: {
					plan_id: {
						type: 'string',
						description: 'Plan UUID (required)'
					},
					name: {
						type: 'string',
						description: 'New plan name'
					},
					description: {
						type: 'string',
						description: 'Plan description'
					},
					update_strategy: {
						type: 'string',
						enum: ['replace', 'append', 'merge_llm'],
						description:
							"How to apply description updates: 'replace' (default), 'append', or 'merge_llm' to intelligently merge with existing description."
					},
					merge_instructions: {
						type: 'string',
						description:
							'Optional guidance when merging description text (e.g., preserve milestones, weave in new scope). Used with append/merge_llm.'
					},
					start_date: {
						type: 'string',
						description: 'Planned start date (ISO timestamp)'
					},
					end_date: {
						type: 'string',
						description: 'Planned end date (ISO timestamp)'
					},
					state_key: {
						type: 'string',
						description: 'Plan state (draft, active, blocked, complete)'
					},
					props: {
						type: 'object',
						description: 'Metadata fields to merge into plan props'
					}
				},
				required: ['plan_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_onto_document',
			description: `Update an existing ontology document.
Use for edits to titles, states, body markdown, or metadata.`,
			parameters: {
				type: 'object',
				properties: {
					document_id: {
						type: 'string',
						description: 'Document UUID (required)'
					},
					title: {
						type: 'string',
						description: 'New document title'
					},
					type_key: {
						type: 'string',
						description: 'New document type key'
					},
					state_key: {
						type: 'string',
						description: 'Document state'
					},
					body_markdown: {
						type: 'string',
						description: 'Markdown content to store'
					},
					update_strategy: {
						type: 'string',
						description:
							"How to apply body_markdown: 'replace' (default), 'append', or 'merge_llm' to intelligently merge with existing content.",
						enum: ['replace', 'append', 'merge_llm'],
						default: 'replace'
					},
					merge_instructions: {
						type: 'string',
						description:
							'Optional guidance when merging content (e.g., keep headers, preserve tables, integrate research notes). Used with append/merge_llm.'
					},
					props: {
						type: 'object',
						description: 'Metadata fields to merge into document props'
					}
				},
				required: ['document_id']
			}
		}
	},

	// DELETE TOOLS
	{
		type: 'function',
		function: {
			name: 'delete_onto_task',
			description: `Delete a task from the ontology system.
Removes the task and all associated onto_edges relationships.
This action is permanent and cannot be undone.
Verifies ownership before deletion.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task UUID (required)'
					}
				},
				required: ['task_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'delete_onto_document',
			description: `Delete a document from the ontology system.
Removes the document and associated edges. This action is permanent.`,
			parameters: {
				type: 'object',
				properties: {
					document_id: {
						type: 'string',
						description: 'Document UUID (required)'
					}
				},
				required: ['document_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'delete_onto_goal',
			description: `Delete a goal from the ontology system.
This action is permanent and cannot be undone.`,
			parameters: {
				type: 'object',
				properties: {
					goal_id: {
						type: 'string',
						description: 'Goal UUID (required)'
					}
				},
				required: ['goal_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'delete_onto_plan',
			description: `Delete a plan from the ontology system.
Note: Tasks in this plan will NOT be deleted, only the plan container.
This action is permanent and cannot be undone.`,
			parameters: {
				type: 'object',
				properties: {
					plan_id: {
						type: 'string',
						description: 'Plan UUID (required)'
					}
				},
				required: ['plan_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_onto_project',
			description: `Create a new project in the ontology system with full structure.

This is the PRIMARY tool for creating projects. It supports creating a complete project with:
- Goals, requirements, plans, tasks
- Outputs, documents, sources
- Metrics, milestones, risks, decisions
- Custom entity relationships
- Context document linkage (document.context.project)

**IMPORTANT**: You should INFER as much as possible from the user's message:
- Project name from context
- Appropriate type_key classification using project.{realm}.{deliverable}[.{variant}]
- Start date (default to today if not specified)
- Facets (context, scale, stage) from user intent
- Basic goals and tasks from user description
- ⚠️ **Props extracted from user's message** - CRITICAL!

**Props Extraction (CRITICAL)**:
1. Use the prop conventions (snake_case, booleans as is_* or has_*)
2. Extract ALL relevant values from the user's message (e.g., genre, tech_stack, audience, deadlines)
3. Populate project.props (JSONB) with inferred values plus facets (context/scale/stage) when present

Example: User says "wedding for 150 guests at Grand Hall"
→ props: { facets: {...}, venue_details: { name: "Grand Hall" }, guest_count: 150, budget: null }

**When to use clarifications array**:
Only add clarification questions if CRITICAL information is missing that you cannot reasonably infer.
For example:
- If user says "create a book project", DON'T ask for project name - infer it's about a book
- If user says "start a project", DO ask what kind of project

**Workflow**:
1. Infer the right type_key from taxonomy (project.creative.book, project.technical.app, etc.)
2. Extract props from the user's message using prop naming guidance
3. Fill in ProjectSpec with inferred data AND extracted props
4. Add clarifications[] only if essential info is missing
5. Call this tool with the complete spec

**ProjectSpec Structure**:
{
  project: {
    name: string (REQUIRED - infer from user message),
    type_key: string (REQUIRED - classify via project.{realm}.{deliverable}[.{variant}]),
    description?: string (infer from user message),
    state_key?: string (default: "draft"),
    props?: { facets?: { context?, scale?, stage? } },
    start_at?: ISO datetime (default to now),
    end_at?: ISO datetime
  },
  goals?: [{ name, description?, type_key?, props? }],
  requirements?: [{ text, type_key?, props? }],
  plans?: [{ name, type_key, state_key?, props? }],
  tasks?: [{ title, plan_name?, state_key?, priority?, due_at?, props? }],
  outputs?: [{ name, type_key, state_key?, props? }],
  documents?: [{ title, type_key, state_key?, body_markdown?, props? }],
  context_document?: { title: string, body_markdown: string, props? },
  clarifications?: [{ key, question, required, choices?, help_text? }],
  meta?: { model, confidence, suggested_facets } (NOT sent to API)
}`,
			parameters: {
				type: 'object',
				properties: {
					project: {
						type: 'object',
						description: 'Project definition (REQUIRED)',
						properties: {
							name: {
								type: 'string',
								description: 'Project name (REQUIRED - infer from user message)'
							},
							type_key: {
								type: 'string',
								description:
									'Type classification like "project.creative.book" (REQUIRED). Must use project.{realm}.{deliverable}[.{variant}] format. Always set a value based on the conversation (no templates).'
							},
							description: {
								type: 'string',
								description:
									'Project description (optional - infer from user message)'
							},
							also_types: {
								type: 'array',
								items: { type: 'string' },
								description: 'Additional type classifications (optional)'
							},
							state_key: {
								type: 'string',
								description: 'Initial state (optional, defaults to "draft")'
							},
							props: {
								type: 'object',
								description: `⚠️ CRITICAL: Properties extracted from the user's message.

This object is stored as JSONB and SHOULD contain:
1. facets (context, scale, stage) - Standard project facets
2. ALL relevant properties with values from the user's message using prop naming

**Extraction Process**:
- Use prop naming guidance (snake_case, is_/has_ for booleans, *_count, target_*)
- For each meaningful attribute the user mentions, add it to props
- Use intelligent defaults for properties inferable from context

**Examples**:
- Software app: user says "Next.js app on Vercel, MVP for indie creators" → props: { tech_stack: ["nextjs"], deployment_target: "vercel", is_mvp: true, target_users: "indie creators" }
- Business launch: user says "product launch in Feb with $75k budget and 500 target customers" → props: { launch_date: "2025-02-01", budget: 75000, target_customers: 500, channels: ["email", "paid_social"] }
- Event: user says "wedding for 200 guests at Grand Hall" → props: { venue: "Grand Hall", guest_count: 200, budget: null }
- Creative book: user says "YA sci-fi novel, 80k words, due Sept 1" → props: { genre: "sci-fi", audience: "ya", target_word_count: 80000, deadline_date: "2025-09-01" }
- Course: user says "live LLM safety course, 8 lessons, 45 minutes each" → props: { topic: "LLM safety", lesson_count: 8, target_duration_minutes: 45, delivery_mode: "live" }

DO NOT leave props empty when information is available in the conversation!`,
								properties: {
									facets: {
										type: 'object',
										description: 'Standard facets (always include)',
										properties: {
											context: {
												type: 'string',
												enum: [
													'personal',
													'client',
													'commercial',
													'internal',
													'open_source',
													'community',
													'academic',
													'nonprofit',
													'startup'
												]
											},
											scale: {
												type: 'string',
												enum: ['micro', 'small', 'medium', 'large', 'epic']
											},
											stage: {
												type: 'string',
												enum: [
													'discovery',
													'planning',
													'execution',
													'launch',
													'maintenance',
													'complete'
												]
											}
										}
									}
								}
							},
							start_at: {
								type: 'string',
								description: 'Start date in ISO format (optional, default to now)'
							},
							end_at: {
								type: 'string',
								description: 'End date in ISO format (optional)'
							}
						},
						required: ['name', 'type_key']
					},
					goals: {
						type: 'array',
						description: 'Project goals (optional - infer from user message)',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								description: { type: 'string' },
								type_key: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['name']
						}
					},
					requirements: {
						type: 'array',
						description: 'Project requirements (optional)',
						items: {
							type: 'object',
							properties: {
								text: { type: 'string', description: 'Requirement description' },
								type_key: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['text']
						}
					},
					plans: {
						type: 'array',
						description: 'Execution plans (optional)',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								type_key: { type: 'string' },
								state_key: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['name', 'type_key']
						}
					},
					tasks: {
						type: 'array',
						description: 'Initial tasks (optional - infer from user message)',
						items: {
							type: 'object',
							properties: {
								title: { type: 'string' },
								plan_name: { type: 'string' },
								state_key: { type: 'string' },
								priority: { type: 'number', minimum: 1, maximum: 5 },
								due_at: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['title']
						}
					},
					outputs: {
						type: 'array',
						description: 'Expected outputs/deliverables (optional)',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								type_key: { type: 'string' },
								state_key: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['name', 'type_key']
						}
					},
					documents: {
						type: 'array',
						description: 'Project documents (optional)',
						items: {
							type: 'object',
							properties: {
								title: { type: 'string' },
								type_key: { type: 'string' },
								state_key: { type: 'string' },
								body_markdown: {
									type: 'string',
									description: 'Optional markdown body stored on the document'
								},
								props: { type: 'object' }
							},
							required: ['title', 'type_key']
						}
					},
					context_document: {
						type: 'object',
						description:
							'Canonical context document (document.context.project) that will be linked to the project.',
						properties: {
							title: { type: 'string' },
							body_markdown: {
								type: 'string',
								description: 'Markdown body with the user braindump/overview'
							},
							type_key: {
								type: 'string',
								description: 'Defaults to document.context.project'
							},
							state_key: {
								type: 'string',
								description: 'Document state (defaults to active)'
							},
							props: {
								type: 'object',
								description: 'Additional metadata (e.g., spark notes, tags)'
							}
						},
						required: ['title', 'body_markdown']
					},
					clarifications: {
						type: 'array',
						description:
							'Questions for user if critical info is missing (use sparingly)',
						items: {
							type: 'object',
							properties: {
								key: {
									type: 'string',
									description: 'Unique key for this question'
								},
								question: { type: 'string', description: 'The question to ask' },
								required: {
									type: 'boolean',
									description: 'Whether answer is required'
								},
								choices: {
									type: 'array',
									items: { type: 'string' },
									description: 'Optional predefined choices'
								},
								help_text: { type: 'string' }
							},
							required: ['key', 'question', 'required']
						}
					},
					meta: {
						type: 'object',
						description: 'Metadata about the generation (optional)',
						properties: {
							model: { type: 'string' },
							confidence: { type: 'number', minimum: 0, maximum: 1 },
							suggested_facets: {
								type: 'object',
								properties: {
									context: { type: 'string' },
									scale: { type: 'string' },
									stage: { type: 'string' }
								}
							}
						}
					}
				},
				required: ['project']
			}
		}
	},

	// ============================================
	// UTILITY TOOLS (Schema & Reference)
	// ============================================

	{
		type: 'function',
		function: {
			name: 'get_field_info',
			description: `Get authoritative information about entity fields including data types, valid values, and descriptions.
Use this when users ask questions like:
- "What are the valid project statuses?"
- "What priority levels can tasks have?"
- "What fields can I set on a project?"
- Any question about valid values, field types, or entity schemas.`,
			parameters: {
				type: 'object',
				properties: {
					entity_type: {
						type: 'string',
						enum: [
							'ontology_project',
							'ontology_task',
							'ontology_plan',
							'ontology_goal'
						],
						description: 'Ontology entity type to inspect'
					},
					field_name: {
						type: 'string',
						description:
							'Specific field name (optional). If provided, returns info for that field only. If omitted, returns commonly-used fields summary.'
					}
				},
				required: ['entity_type']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'web_search',
			description: `Perform a live web search using the Tavily API for current or external information not present in BuildOS.
Use when the user asks for recent facts, market research, competitive intel, or requests citations.
Return the concise answer plus the most relevant sources so the assistant can cite URLs in its reply.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'The search query to send to Tavily (required)'
					},
					search_depth: {
						type: 'string',
						enum: ['basic', 'advanced'],
						description:
							'Search depth. Use "basic" for fast lookups; "advanced" for more thorough research.'
					},
					max_results: {
						type: 'number',
						default: 5,
						maximum: 10,
						description: 'Maximum number of results to return (1-10)'
					},
					include_answer: {
						type: 'boolean',
						description:
							'Whether to request Tavily to synthesize an answer. Defaults to true.'
					},
					include_domains: {
						type: 'array',
						items: { type: 'string' },
						description: 'Restrict results to these domains.'
					},
					exclude_domains: {
						type: 'array',
						items: { type: 'string' },
						description: 'Exclude results from these domains.'
					}
				},
				required: ['query'],
				additionalProperties: false
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_buildos_overview',
			description: `Return the canonical BuildOS overview reference.
Use this whenever the user asks broad questions such as:
- "What is BuildOS?"
- "What workflows does BuildOS support?"
- "Point me to the docs about BuildOS."
The tool responds with a structured document that summarizes the mission, architecture, major features, and documentation entry points.`,
			parameters: {
				type: 'object',
				properties: {},
				additionalProperties: false
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_buildos_usage_guide',
			description: `Return the hands-on BuildOS usage playbook.
Use this when the user needs step-by-step instructions for capturing brain dumps, creating ontology projects, connecting calendar integrations, or collaborating with the agentic chat system.
It responds with a structured guide that walks through onboarding, planning, automation, and agent workflows.`,
			parameters: {
				type: 'object',
				properties: {},
				additionalProperties: false
			}
		}
	}
];

export type ToolContextScope =
	| 'base'
	| 'global'
	| 'project_create'
	| 'project'
	| 'project_audit'
	| 'project_forecast';

export interface ToolMetadata {
	summary: string;
	capabilities: string[];
	contexts: ToolContextScope[];
	category: 'search' | 'read' | 'write' | 'utility';
}

export const TOOL_METADATA: Record<string, ToolMetadata> = {
	list_onto_tasks: {
		summary: 'Browse recent ontology tasks with status and owning project context.',
		capabilities: [
			'Filter by project or state',
			'Returns abbreviated summaries for fast scans'
		],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	search_onto_tasks: {
		summary: 'Keyword search for tasks when the exact project is unknown.',
		capabilities: ['Matches task titles', 'Optional project/state filters'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_goals: {
		summary: 'List project goals with brief descriptions.',
		capabilities: ['Filter by project', 'Highlights strategic objectives'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_plans: {
		summary: 'Show plans that organize related tasks.',
		capabilities: ['Filter by project', 'Provides plan state/type context'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_documents: {
		summary: 'List project documents (briefs, specs, context, research).',
		capabilities: ['Filter by project/type/state', 'Returns concise summaries'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_projects: {
		summary: 'List ontology projects grouped by recent activity.',
		capabilities: ['Filter by type or state', 'Highlights facet metadata'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	search_onto_projects: {
		summary: 'Keyword search across project names/descriptions.',
		capabilities: ['Focus on discovery', 'Supports state/type filters'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	search_onto_documents: {
		summary: 'Keyword search for documents by title.',
		capabilities: ['Supports project/type/state filters', 'Fast doc discovery'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	search_ontology: {
		summary: 'Fuzzy search across all ontology entities with snippets.',
		capabilities: [
			'Scans tasks/plans/goals/milestones/documents/outputs/requirements',
			'Accepts project scope and type filters'
		],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	get_onto_project_details: {
		summary: 'Load the complete ontology project graph and metadata.',
		capabilities: ['Returns nested entities', 'Use after identifying a project'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_task_details: {
		summary: 'Load full task details including props and relationships.',
		capabilities: ['Validates ownership', 'Great for deep task updates'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_goal_details: {
		summary: 'Load full goal details including props.',
		capabilities: ['Validates ownership', 'Great before editing KPIs'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_plan_details: {
		summary: 'Load full plan details including props.',
		capabilities: ['Validates ownership', 'Great before editing timelines'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_document_details: {
		summary: 'Load full document details including body markdown/props.',
		capabilities: ['Validates ownership', 'Use before edits or linking'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_entity_relationships: {
		summary: 'Graph traversal helper for edges between ontology entities.',
		capabilities: ['Supports direction filters', 'Useful before multi-entity analysis'],
		contexts: ['base', 'project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_linked_entities: {
		summary: 'Get detailed linked entities with names, states, and descriptions.',
		capabilities: [
			'Returns full entity details',
			'Supports filtering by entity type',
			'Use when abbreviated context needs expansion'
		],
		contexts: ['base', 'project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	create_onto_project: {
		summary:
			'End-to-end project creation with classified type_key, inferred props, and nested entities.',
		capabilities: ['Supports goals/plans/tasks scaffolding', 'Captures clarifications'],
		contexts: ['project_create', 'project'],
		category: 'write'
	},
	create_onto_task: {
		summary: 'Add a new task within a project/plan.',
		capabilities: ['Sets priority/state/plan links', 'Accepts metadata props'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	create_onto_goal: {
		summary: 'Record a new goal aligned to the current project.',
		capabilities: ['Supports type classification', 'Stores KPI metadata'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	create_onto_plan: {
		summary: 'Add execution plans that group related tasks.',
		capabilities: ['Assigns type/state', 'Accepts props for richer context'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	create_onto_document: {
		summary: 'Create a document linked to a project (brief/spec/context).',
		capabilities: ['Validates ownership', 'Stores body markdown/props'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_task: {
		summary: 'Modify task status, assignment, or metadata.',
		capabilities: [
			'Supports partial updates',
			'Validates ownership',
			'Append or LLM-merge description updates safely'
		],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_project: {
		summary: 'Update project headline details and facets.',
		capabilities: ['Change states/facets', 'Accepts partial updates'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_goal: {
		summary: 'Modify goal details (priority, target date, KPIs).',
		capabilities: [
			'Supports partial updates',
			'Validates ownership',
			'Append or LLM-merge description updates safely'
		],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_plan: {
		summary: 'Modify plan details (state, dates, metadata).',
		capabilities: [
			'Supports partial updates',
			'Validates ownership',
			'Append or LLM-merge description updates safely'
		],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_document: {
		summary: 'Modify document title/type/state/body/metadata.',
		capabilities: [
			'Supports partial updates',
			'Validates ownership',
			'Append or LLM-merge body content safely'
		],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	create_task_document: {
		summary: 'Create or attach a document to a specific task workspace.',
		capabilities: [
			'Creates task_has_document edge',
			'Can attach existing docs',
			'Keeps project has_document for discovery'
		],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	list_task_documents: {
		summary: 'List documents linked to a task via task_has_document edges.',
		capabilities: ['Returns documents plus edge metadata', 'Highlights scratch vs deliverable'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	delete_onto_task: {
		summary: 'Remove a task and associated edges.',
		capabilities: ['Validates ownership', 'Irreversible delete'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	delete_onto_document: {
		summary: 'Remove a document and associated edges.',
		capabilities: ['Validates ownership', 'Irreversible delete'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	delete_onto_goal: {
		summary: 'Remove a goal from the project graph.',
		capabilities: ['Validates ownership', 'Irreversible delete'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	delete_onto_plan: {
		summary: 'Delete a plan container while leaving tasks untouched.',
		capabilities: ['Validates ownership', 'Irreversible delete'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	get_field_info: {
		summary: 'Schema helper that explains entity fields, enums, and valid values.',
		capabilities: ['Provides enum values & examples', 'Great for structured updates'],
		contexts: [
			'base',
			'global',
			'project_create',
			'project',
			'project_audit',
			'project_forecast'
		],
		category: 'utility'
	},
	web_search: {
		summary: 'Live web research via Tavily with synthesized answer and cited sources.',
		capabilities: [
			'Searches current web content',
			'Optional domain allow/deny lists',
			'Returns ranked sources plus Tavily short answer'
		],
		contexts: [
			'base',
			'global',
			'project_create',
			'project',
			'project_audit',
			'project_forecast'
		],
		category: 'search'
	},
	get_buildos_overview: {
		summary:
			'High-level BuildOS overview covering mission, architecture, and documentation map.',
		capabilities: [
			'Explains platform pillars',
			'Lists doc entry points',
			'Clarifies architecture responsibilities'
		],
		contexts: [
			'base',
			'global',
			'project_create',
			'project',
			'project_audit',
			'project_forecast'
		],
		category: 'utility'
	},
	get_buildos_usage_guide: {
		summary: 'Step-by-step BuildOS usage playbook for onboarding, planning, and automation.',
		capabilities: [
			'Describes workflows (brain dumps → ontology → scheduling)',
			'Highlights prop inference + calendar actions',
			'Suggests follow-up tool calls'
		],
		contexts: [
			'base',
			'global',
			'project_create',
			'project',
			'project_audit',
			'project_forecast'
		],
		category: 'utility'
	}
};
