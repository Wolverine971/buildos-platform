// apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts
/**
 * Ontology Read Tool Definitions
 *
 * Tools for querying ontology entities: list_*, search_*, get_* operations.
 * These are read-only tools that don't modify data.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

export const ONTOLOGY_READ_TOOLS: ChatToolDefinition[] = [
	// ============================================
	// LIST TOOLS
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
						description: 'Filter by state (todo, in_progress, blocked, done)'
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
						description:
							'Filter by document state (draft, in_review, ready, published, archived)'
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
			name: 'list_onto_outputs',
			description: `List outputs from the ontology system (onto_outputs table). Returns output summaries with state and type.
Use for deliverables, artifacts, or outputs tied to a project.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter outputs by project ID'
					},
					state_key: {
						type: 'string',
						description:
							'Filter by output state (draft, in_progress, review, published)'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of outputs to return'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'list_onto_milestones',
			description: `List milestones from the ontology system (onto_milestones table). Returns milestone summaries with dates and state.
Use for project timelines, checkpoints, or delivery milestones.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter milestones by project ID'
					},
					state_key: {
						type: 'string',
						description:
							'Filter by milestone state (pending, in_progress, completed, missed)'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of milestones to return'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'list_onto_risks',
			description: `List risks from the ontology system (onto_risks table). Returns risk summaries with impact and state.
Use for risk reviews, mitigation planning, or status updates.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter risks by project ID'
					},
					state_key: {
						type: 'string',
						description:
							'Filter by risk state (identified, mitigated, occurred, closed)'
					},
					impact: {
						type: 'string',
						description: 'Filter by impact level (low, medium, high, critical)'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of risks to return'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'list_onto_decisions',
			description: `List decisions from the ontology system (onto_decisions table). Returns decision summaries with decision dates.
Use for decision logs, rationale audits, or historical context.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter decisions by project ID'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of decisions to return'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'list_onto_requirements',
			description: `List requirements from the ontology system (onto_requirements table). Returns requirement summaries with priority.
Use for constraints, compliance, or scope requirements.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter requirements by project ID'
					},
					type_key: {
						type: 'string',
						description: 'Filter by requirement type key'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of requirements to return'
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
						description:
							'Filter by project state (planning, active, completed, cancelled)'
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

	// ============================================
	// SEARCH TOOLS
	// ============================================

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
						description:
							'Filter by project state (planning, active, completed, cancelled)'
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
						description:
							'Filter by document state (draft, in_review, ready, published, archived)'
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
								'requirement',
								'risk',
								'decision',
								'metric',
								'source'
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

	// ============================================
	// GET DETAILS TOOLS
	// ============================================

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
			description: `Get complete details for a specific ontology document including content, description, and metadata.
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
			name: 'get_onto_output_details',
			description: `Get complete details for a specific ontology output including description and metadata.
Use when you need the full output record before updating it.`,
			parameters: {
				type: 'object',
				properties: {
					output_id: {
						type: 'string',
						description: 'Output ID to retrieve'
					}
				},
				required: ['output_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_onto_milestone_details',
			description: `Get complete details for a specific ontology milestone including dates, state, and metadata.
Use when you need the full milestone before updating it.`,
			parameters: {
				type: 'object',
				properties: {
					milestone_id: {
						type: 'string',
						description: 'Milestone ID to retrieve'
					}
				},
				required: ['milestone_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_onto_risk_details',
			description: `Get complete details for a specific ontology risk including impact, probability, and mitigation info.
Use when you need the full risk before updating it.`,
			parameters: {
				type: 'object',
				properties: {
					risk_id: {
						type: 'string',
						description: 'Risk ID to retrieve'
					}
				},
				required: ['risk_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_onto_decision_details',
			description: `Get complete details for a specific ontology decision including decision date and rationale.
Use when you need the full decision record before updating it.`,
			parameters: {
				type: 'object',
				properties: {
					decision_id: {
						type: 'string',
						description: 'Decision ID to retrieve'
					}
				},
				required: ['decision_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_onto_requirement_details',
			description: `Get complete details for a specific ontology requirement including priority and type.
Use when you need the full requirement record before updating it.`,
			parameters: {
				type: 'object',
				properties: {
					requirement_id: {
						type: 'string',
						description: 'Requirement ID to retrieve'
					}
				},
				required: ['requirement_id']
			}
		}
	},

	// ============================================
	// RELATIONSHIP TOOLS
	// ============================================

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
						enum: [
							'task',
							'plan',
							'goal',
							'milestone',
							'document',
							'output',
							'risk',
							'decision',
							'requirement',
							'metric',
							'source'
						],
						description: 'Type of the source entity'
					},
					filter_kind: {
						type: 'string',
						enum: [
							'task',
							'plan',
							'goal',
							'milestone',
							'document',
							'output',
							'risk',
							'decision',
							'requirement',
							'metric',
							'source',
							'all'
						],
						default: 'all',
						description: 'Filter to specific entity type, or "all" for everything'
					}
				},
				required: ['entity_id', 'entity_kind']
			}
		}
	}
];
