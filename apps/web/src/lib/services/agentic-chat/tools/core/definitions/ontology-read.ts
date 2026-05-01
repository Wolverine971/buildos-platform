// apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts
/**
 * Ontology Read Tool Definitions
 *
 * Tools for querying ontology entities: list_*, search_*, get_* operations.
 * These are read-only tools that don't modify data.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

const ARCHIVED_FILTER_PARAMETER = {
	type: 'boolean',
	default: false,
	description:
		'When true, return archived records only. Omitted or false returns active records only.'
};

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
					type_key: {
						type: 'string',
						description: 'Filter by task type key'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum tasks to return'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
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
					state_key: {
						type: 'string',
						description: 'Filter by goal state (draft, active, achieved, abandoned)'
					},
					type_key: {
						type: 'string',
						description: 'Filter by goal type key'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'list_onto_documents',
			description: `List documents from the ontology system (onto_documents table). Returns document summaries plus markdown heading outlines (H1/H2/H3), not full body content.
Use get_onto_document_details when full document content is needed.`,
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
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of documents to return'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
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
					type_key: {
						type: 'string',
						description: 'Filter by milestone type key'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of milestones to return'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
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
					type_key: {
						type: 'string',
						description: 'Filter by risk type key'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of risks to return'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
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
					state_key: {
						type: 'string',
						description: 'Filter by plan state (draft, active, completed)'
					},
					type_key: {
						type: 'string',
						description: 'Filter by plan type key'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
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
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
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
Use when you need to see the work artifacts, drafts, or scratch docs associated with a task.
Do not call for plain task metadata updates (title/state/priority) unless document context is explicitly needed.`,
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
			name: 'search_all_projects',
			description: `Primary agent search across all accessible BuildOS projects. Use this broad search when the project is unknown or the user is asking a cross-project question.
Returns typed ontology matches with snippets so you can quickly shortlist items before loading details.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							'Search text to match across accessible BuildOS projects (required)'
					},
					types: {
						type: 'array',
						description: 'Optional entity type filters for narrowing results',
						items: {
							type: 'string',
							enum: [
								'project',
								'task',
								'goal',
								'plan',
								'milestone',
								'document',
								'risk',
								'requirement',
								'image'
							]
						}
					},
					limit: {
						type: 'number',
						default: 10,
						maximum: 25,
						description: 'Maximum number of results (capped at 25)'
					}
				},
				required: ['query']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_project',
			description: `Primary agent search inside one BuildOS project. Use this when a project_id is known or the chat is already scoped to a project.
Returns typed ontology matches with snippets so you can quickly shortlist items before loading details.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID to scope the search to (required)'
					},
					query: {
						type: 'string',
						description: 'Search text to match inside the specified project (required)'
					},
					types: {
						type: 'array',
						description: 'Optional entity type filters for narrowing results',
						items: {
							type: 'string',
							enum: [
								'project',
								'task',
								'goal',
								'plan',
								'milestone',
								'document',
								'risk',
								'requirement',
								'image'
							]
						}
					},
					limit: {
						type: 'number',
						default: 10,
						maximum: 25,
						description: 'Maximum number of results (capped at 25)'
					}
				},
				required: ['project_id', 'query']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_onto_tasks',
			description: `Search tasks across all ontology projects using keywords. Returns concise task matches with project context.
Use when the user references a task by name or description but the project is unknown. For broader project-scoped discovery across tasks, documents, plans, and goals, prefer search_project.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							'Keyword query to match against task titles and descriptions. Explicit OR queries such as "blog OR Instagram" are treated as alternatives.'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
					},
					state_key: {
						type: 'string',
						description: 'Filter by state (todo, in_progress, blocked, done)'
					},
					type_key: {
						type: 'string',
						description: 'Filter by task type key'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of search results'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
					}
				},
				required: ['query']
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
					query: {
						type: 'string',
						description: 'Keyword query to search for (required)'
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
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 12,
						maximum: 50,
						description: 'Maximum search matches to return'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
					}
				},
				required: ['query']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_onto_documents',
			description: `Search ontology documents by title. Returns concise matches plus markdown heading outlines (H1/H2/H3), not full body content.
Use get_onto_document_details when full document content is needed.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Keyword query to search for (required)'
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
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of search results'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
					}
				},
				required: ['query']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_onto_goals',
			description:
				'Search ontology goals by name or description. Returns concise matches for goal discovery.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Keyword query to search for (required)'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
					},
					state_key: {
						type: 'string',
						description: 'Filter by goal state (draft, active, achieved, abandoned)'
					},
					type_key: {
						type: 'string',
						description: 'Filter by goal type key'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of search results'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
					}
				},
				required: ['query']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_onto_plans',
			description:
				'Search ontology plans by name or description. Returns concise matches for plan discovery.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Keyword query to search for (required)'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
					},
					state_key: {
						type: 'string',
						description: 'Filter by plan state (draft, active, completed)'
					},
					type_key: {
						type: 'string',
						description: 'Filter by plan type key'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of search results'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
					}
				},
				required: ['query']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_onto_milestones',
			description:
				'Search ontology milestones by title or description. Returns concise matches for timeline discovery.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Keyword query to search for (required)'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
					},
					state_key: {
						type: 'string',
						description:
							'Filter by milestone state (pending, in_progress, completed, missed)'
					},
					type_key: {
						type: 'string',
						description: 'Filter by milestone type key'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of search results'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
					}
				},
				required: ['query']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_onto_risks',
			description:
				'Search ontology risks by title or content. Returns concise matches for risk discovery.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Keyword query to search for (required)'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
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
					type_key: {
						type: 'string',
						description: 'Filter by risk type key'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of search results'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
					}
				},
				required: ['query']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_ontology',
			description: `Compatibility search across ontology entities. Prefer search_all_projects for broad search and search_project for project-scoped search.
Use only when older instructions specifically mention search_ontology.`,
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
							enum: ['task', 'goal', 'plan', 'milestone', 'document', 'risk']
						}
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum number of results (capped at 50)'
					},
					offset: {
						type: 'number',
						default: 0,
						description: 'Zero-based pagination offset'
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
			name: 'get_onto_project_graph',
			description: `Get the full project graph payload (all entities + edges) for a project.
Use when you need to reorganize or analyze the complete project graph structure.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID to retrieve the full graph for'
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
			description: `Get complete details for a specific ontology plan including the detailed plan body, properties, and metadata.
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
			name: 'get_document_tree',
			description: `Get the hierarchical document tree structure for a project.
Returns the tree structure; set include_documents to include document metadata and unlinked docs.
Documents are organized in a wiki-like tree structure with folders (documents that have children) and leaf documents.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID to get the document tree for (required)'
					},
					include_documents: {
						type: 'boolean',
						default: false,
						description:
							'Include document metadata and unlinked document list. Set true when you need titles or orphaned docs.'
					},
					include_content: {
						type: 'boolean',
						default: false,
						description:
							'Include full document content bodies. Only applies when include_documents is true.'
					}
				},
				required: ['project_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_document_path',
			description: `Get the breadcrumb path for a document in the tree structure.
Returns an array of ancestor document IDs and titles from root to the specified document.
Useful for showing where a document lives in the hierarchy.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID (optional; inferred from document if omitted)'
					},
					document_id: {
						type: 'string',
						description: 'Document ID to get the path for (required)'
					}
				},
				required: ['document_id']
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
							'risk',
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
							'risk',
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
