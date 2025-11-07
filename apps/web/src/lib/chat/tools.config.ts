// apps/web/src/lib/chat/tools.config.ts
/**
 * Chat Tool Definitions - Progressive Disclosure Pattern
 *
 * This module defines the tools available to the chat system, organized in two tiers:
 * 1. LIST/SEARCH tools - Return abbreviated data (reduce tokens by ~70%)
 * 2. DETAIL tools - Return complete data (only when explicitly needed)
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
			description: 'Template classification such as project.writer.book',
			required: true,
			example: 'project.writer.book'
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
			description: 'Optional plan that the task belongs to',
			required: false,
			example: '9a9c0d90-736f-4a2b-8ac0-1234567890ab'
		},
		type_key: {
			type: 'string',
			description: 'Template type for the task (task.marketing.email, etc.)',
			required: false,
			example: 'task.marketing.email'
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
			example: 'Acquisition Experiments Plan'
		},
		type_key: {
			type: 'string',
			description: 'Template classification for the plan',
			required: true,
			example: 'plan.growth.experiment'
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
			description: 'Template classification for the goal',
			required: false,
			example: 'goal.revenue.target'
		},
		props: {
			type: 'string',
			description: 'Goal metadata (JSON stored in props)',
			required: false,
			example: '{"metrics":{"target":50000,"unit":"USD"}}'
		}
	},
	ontology_template: {
		scope: {
			type: 'enum',
			enum_values: ['project', 'plan', 'task', 'output', 'document', 'goal', 'requirement'],
			description: 'Entity type the template instantiates',
			required: true,
			example: 'project'
		},
		realm: {
			type: 'string',
			description: 'Domain/realm such as writer, developer, coach',
			required: false,
			example: 'writer'
		},
		type_key: {
			type: 'string',
			description: 'Unique template key (project.writer.book, plan.growth.launch, etc.)',
			required: true,
			example: 'project.writer.book'
		},
		description: {
			type: 'string',
			description: 'Short explanation of what the template is used for',
			required: false,
			example: 'Multi-chapter book project structure with outline, drafts, and launch plan.'
		}
	}
};

/**
 * Complete set of tools available to the chat system
 * Tools are organized by category for the progressive disclosure pattern
 */
export const CHAT_TOOLS: ChatToolDefinition[] = [
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
Automatically creates the onto_edges relationship linking task to project.`,
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
						default: 'task.basic',
						description: 'Template type key (default: task.basic)'
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
						default: 'goal.basic',
						description: 'Template type key'
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
						default: 'plan.basic',
						description: 'Template type key'
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
						description: 'Assign to different plan (or null to unassign)'
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

	// ============================================
	// TEMPLATE & PROJECT CREATION TOOLS
	// ============================================

	{
		type: 'function',
		function: {
			name: 'list_onto_templates',
			description: `Search and list available ontology templates to find the right template for creating projects, tasks, plans, etc.

Use this tool when the user wants to create a new project/entity and you need to find the appropriate template.
Templates are organized by scope (project, task, plan, output) and realm (writer, developer, coach, etc.).

Examples:
- User: "Create a book writing project" → list_onto_templates(scope="project", realm="writer", search="book")
- User: "Start a new software project" → list_onto_templates(scope="project", realm="developer")
- User: "Create a coaching plan" → list_onto_templates(scope="plan", realm="coach")`,
			parameters: {
				type: 'object',
				properties: {
					scope: {
						type: 'string',
						enum: [
							'project',
							'plan',
							'task',
							'output',
							'document',
							'goal',
							'requirement'
						],
						description: 'Entity type to find templates for (required for best results)'
					},
					realm: {
						type: 'string',
						description:
							'Domain/realm filter (e.g., "writer", "developer", "coach", "designer")'
					},
					search: {
						type: 'string',
						description:
							'Text search across template names, type_keys, and descriptions'
					},
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
						],
						description: 'Filter by context facet'
					},
					scale: {
						type: 'string',
						enum: ['micro', 'small', 'medium', 'large', 'epic'],
						description: 'Filter by scale facet'
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
						],
						description: 'Filter by stage facet'
					}
				}
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

**IMPORTANT**: You should INFER as much as possible from the user's message:
- Project name from context
- Appropriate template type_key (use list_onto_templates first)
- Start date (default to today if not specified)
- Facets (context, scale, stage) from user intent
- Basic goals and tasks from user description

**When to use clarifications array**:
Only add clarification questions if CRITICAL information is missing that you cannot reasonably infer.
For example:
- If user says "create a book project", DON'T ask for project name - infer it's about a book
- If user says "start a project", DO ask what kind of project

**Workflow**:
1. Search templates with list_onto_templates to find appropriate type_key
2. Fill in ProjectSpec with inferred data
3. Add clarifications[] only if essential info is missing
4. Call this tool with the spec

**ProjectSpec Structure**:
{
  project: {
    name: string (REQUIRED - infer from user message),
    type_key: string (REQUIRED - from template search),
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
  documents?: [{ title, type_key, state_key?, props? }],
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
									'Template type key like "project.writer.book" (REQUIRED - get from list_onto_templates)'
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
								description: 'Project properties including facets',
								properties: {
									facets: {
										type: 'object',
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
								props: { type: 'object' }
							},
							required: ['title', 'type_key']
						}
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
							'ontology_goal',
							'ontology_template'
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
	}
];

/**
 * Tool categories for analytics and cost tracking
 */
export const TOOL_CATEGORIES = {
	ontology: {
		tools: [
			'list_onto_tasks',
			'list_onto_goals',
			'list_onto_plans',
			'list_onto_projects',
			'list_onto_templates',
			'get_onto_project_details',
			'get_onto_task_details',
			'get_entity_relationships'
		],
		averageTokens: 350,
		costTier: 'medium'
	},
	ontology_action: {
		tools: [
			'create_onto_project',
			'create_onto_task',
			'create_onto_goal',
			'create_onto_plan',
			'update_onto_task',
			'update_onto_project',
			'delete_onto_task',
			'delete_onto_goal',
			'delete_onto_plan'
		],
		averageTokens: 400,
		costTier: 'medium'
	},
	utility: {
		tools: ['get_field_info'],
		averageTokens: 80,
		costTier: 'low'
	}
};

/**
 * Get tool category for a given tool name
 */
export function getToolCategory(toolName: string): keyof typeof TOOL_CATEGORIES | null {
	for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
		if (config.tools.includes(toolName)) {
			return category as keyof typeof TOOL_CATEGORIES;
		}
	}
	return null;
}

/**
 * Estimate token usage for a tool call
 */
export function estimateToolTokens(toolName: string): number {
	const category = getToolCategory(toolName);
	if (!category) return 200; // Default estimate
	return TOOL_CATEGORIES[category].averageTokens;
}

// ============================================
// ONTOLOGY-FOCUSED TOOL ARCHITECTURE
// ============================================

/**
 * Extract tools by name from CHAT_TOOLS
 */
export function extractTools(names: string[]): ChatToolDefinition[] {
	return CHAT_TOOLS.filter((tool) => names.includes(tool.function.name));
}

/**
 * ONTOLOGY TOOLS - Primary tool set oriented around onto_* entities
 * Based on ontology data models: projects, tasks, plans, goals, outputs, documents
 */
export const ONTOLOGY_TOOLS = extractTools([
	// TEMPLATES: Search and discovery
	'list_onto_templates',

	// READ: Projects (root entities)
	'list_onto_projects',
	'get_onto_project_details',

	// READ: Tasks (actionable items)
	'list_onto_tasks',
	'get_onto_task_details',

	// READ: Plans (task groupings)
	'list_onto_plans',

	// READ: Goals (objectives)
	'list_onto_goals',

	// READ: Relationships (onto_edges)
	'get_entity_relationships',

	// CREATE: New entities
	'create_onto_project', // Full project creation with all entities
	'create_onto_task',
	'create_onto_goal',
	'create_onto_plan',

	// UPDATE: Existing entities
	'update_onto_task',
	'update_onto_project',

	// DELETE: Remove entities
	'delete_onto_task',
	'delete_onto_goal',
	'delete_onto_plan'
]);

/**
 * LEGACY TOOLS - Backward compatibility for old tasks/projects/notes system
 * These are being phased out in favor of ontology-based entities
 */
export const UTILITY_TOOLS = extractTools(['get_field_info']);

/**
 * Context-aware tool selector
 * Returns the appropriate tool set based on whether ontology context is available
 */
export interface GetToolsOptions {
	/**
	 * Include utility tools (get_field_info, etc.)
	 * Default: true
	 */
	includeUtility?: boolean;
}

/**
 * Get tools appropriate for the current context
 *
 * @example
 * // Ontology + utility (default)
 * const tools = getToolsForContext();
 *
 * @example
 * // Ontology only without schema helper
 * const tools = getToolsForContext({ includeUtility: false });
 */
export function getToolsForContext(options: GetToolsOptions = {}): ChatToolDefinition[] {
	const { includeUtility = true } = options;
	const tools: ChatToolDefinition[] = [...ONTOLOGY_TOOLS];

	if (includeUtility) {
		tools.push(...UTILITY_TOOLS);
	}

	return tools;
}

/**
 * Default tool set - Ontology tools plus schema helpers
 */
export const DEFAULT_TOOLS = getToolsForContext({
	includeUtility: true
});

/**
 * Comprehensive tool set - currently identical to DEFAULT_TOOLS (kept for compatibility)
 */
export const ALL_TOOLS = getToolsForContext({
	includeUtility: true
});
