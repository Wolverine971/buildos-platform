// packages/agentic-chat-runtime/src/catalog/definitions/ontology-read.ts
/**
 * Ontology Read Tool Definitions
 *
 * Tools for querying ontology entities: list_*, search_*, get_* operations.
 * These are read-only tools that don't modify data.
 */

import type { ChatToolDefinition, ToolJsonSchema } from '@buildos/shared-types';

const ARCHIVED_FILTER_PARAMETER: ToolJsonSchema = {
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
			description:
				'List task summaries (id, title, state, and type), optionally filtered by project or state.',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter tasks by project ID'
					},
					state_key: {
						type: 'string',
						enum: ['todo', 'in_progress', 'blocked', 'done']
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
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
			description: 'List goal summaries, optionally filtered by project or archive state.',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter goals by project ID'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 50
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'list_onto_documents',
			description:
				'List document metadata, not body content. Use get_onto_document_details for a full document.',
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
						enum: ['draft', 'in_review', 'ready', 'published', 'archived']
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
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
			name: 'list_onto_milestones',
			description: 'List milestone summaries with dates and state.',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter milestones by project ID'
					},
					state_key: {
						type: 'string',
						enum: ['pending', 'in_progress', 'completed', 'missed']
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
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
			description: 'List risk summaries with impact and state.',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter risks by project ID'
					},
					state_key: {
						type: 'string',
						enum: ['identified', 'mitigated', 'occurred', 'closed']
					},
					impact: {
						type: 'string',
						enum: ['low', 'medium', 'high', 'critical']
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
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
			name: 'list_onto_plans',
			description: 'List plan summaries, optionally filtered by project or archive state.',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter plans by project ID'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 50
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'list_onto_projects',
			description: 'List project summaries for project discovery.',
			parameters: {
				type: 'object',
				properties: {
					state_key: {
						type: 'string',
						enum: ['planning', 'active', 'paused', 'completed', 'cancelled']
					},
					type_key: {
						type: 'string',
						description: 'Filter by project type'
					},
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 50
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
			description:
				'Primary search across accessible projects when the project is unknown or the question is cross-project. Returns typed matches with snippets. Query only distinctive content terms because terms are AND-combined; to scope a known project, pass project_id instead of adding its name to query.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						minLength: 1,
						description:
							'Distinctive content terms; omit the project name when project_id scopes the search.'
					},
					project_id: {
						type: 'string',
						description:
							'Optional. When known, scope the search to this project instead of putting the project name in the query. Prefer this for "in <project>, find X" requests.'
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
						type: 'integer',
						default: 10,
						minimum: 1,
						maximum: 25,
						description: 'Maximum results.'
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
			description:
				'Primary search inside a known project. Returns typed matches with snippets for shortlisting before detail reads.',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID to scope the search to (required)'
					},
					query: {
						type: 'string',
						minLength: 1,
						description: 'Search text inside the project.'
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
						type: 'integer',
						default: 10,
						minimum: 1,
						maximum: 25,
						description: 'Maximum results.'
					}
				},
				required: ['project_id', 'query']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'explore_project',
			description:
				'Semantic discovery: finds entities RELATED to a concept or direction even without keyword overlap (theme "marketing" surfaces a customer-segments doc). Use to gather "everything about X" before a broad change; for one known item use search_project/search_all_projects. Omitting project_id searches all accessible projects, grouped by project.',
			parameters: {
				type: 'object',
				properties: {
					theme: {
						type: 'string',
						minLength: 1,
						description:
							'A concept, topic, or direction as a short phrase (e.g. "marketing strategy"), not an entity title.'
					},
					project_id: {
						type: 'string',
						description:
							'Optional. Scope to one project; omit for all accessible projects.'
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
								'event',
								'image'
							]
						}
					},
					limit: {
						type: 'integer',
						default: 15,
						minimum: 1,
						maximum: 30,
						description: 'Maximum results.'
					}
				},
				required: ['theme']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_onto_tasks',
			description:
				'Task-only keyword search with project context. Prefer search_project/search_all_projects unless task state/archive filters are needed. Multi-word terms match in any order; explicit "A OR B" matches alternatives.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						minLength: 1,
						description:
							'Keyword query to match against task titles and descriptions. Explicit OR queries such as "blog OR Instagram" are treated as alternatives.'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
					},
					state_key: {
						type: 'string',
						enum: ['todo', 'in_progress', 'blocked', 'done']
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 50,
						description: 'Maximum number of search results'
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
			description:
				'Project-only name/description search. Prefer search_all_projects unless state/type filters are needed. Multi-word terms match in any order.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						minLength: 1,
						description: 'Keyword query.'
					},
					state_key: {
						type: 'string',
						enum: ['planning', 'active', 'paused', 'completed', 'cancelled']
					},
					type_key: {
						type: 'string',
						description: 'Filter by type_key classification'
					},
					limit: {
						type: 'integer',
						default: 10,
						minimum: 1,
						maximum: 30,
						description: 'Maximum search matches to return'
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
			description:
				'Document-only search across title, description, and body; returns metadata, not full content. Prefer search_project/search_all_projects unless document filters are needed.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						minLength: 1,
						description: 'Keyword query.'
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
						enum: ['draft', 'in_review', 'ready', 'published', 'archived']
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 50,
						description: 'Maximum number of search results'
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
				'Goal-only name/description search with optional project and archive filters.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						minLength: 1,
						description: 'Keyword query.'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 50,
						description: 'Maximum number of search results'
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
				'Plan-only name/description search with optional project and archive filters.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						minLength: 1,
						description: 'Keyword query.'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 50,
						description: 'Maximum number of search results'
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
				'Milestone-only title/description search with optional project, state, and archive filters.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						minLength: 1,
						description: 'Keyword query.'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
					},
					state_key: {
						type: 'string',
						enum: ['pending', 'in_progress', 'completed', 'missed']
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 50,
						description: 'Maximum number of search results'
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
				'Risk-only title/content search with optional project, state, impact, and archive filters.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						minLength: 1,
						description: 'Keyword query.'
					},
					project_id: {
						type: 'string',
						description: 'Optional project filter to limit matches'
					},
					state_key: {
						type: 'string',
						enum: ['identified', 'mitigated', 'occurred', 'closed']
					},
					impact: {
						type: 'string',
						enum: ['low', 'medium', 'high', 'critical']
					},
					archived: ARCHIVED_FILTER_PARAMETER,
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 50,
						description: 'Maximum number of search results'
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
						minLength: 1,
						description: 'Search text across ontology entities.'
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
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 50,
						description: 'Maximum results.'
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

	{
		type: 'function',
		function: {
			name: 'get_document_outline',
			description: `Get a document's heading outline (table of contents), not its body. Cheap way to decide if a doc is relevant and which part to read; each heading has an anchor for read_document_section. Prefer over get_onto_document_details for scanning.`,
			parameters: {
				type: 'object',
				properties: {
					document_id: {
						type: 'string',
						description: 'Document ID to outline (required)'
					}
				},
				required: ['document_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'read_document_section',
			description: `Read one section of a document by heading anchor (from get_document_outline), not the whole body. Returns that section plus nested subsections — pull in only the relevant context. Lists available anchors if the anchor is unknown.`,
			parameters: {
				type: 'object',
				properties: {
					document_id: {
						type: 'string',
						description: 'Document ID to read from (required)'
					},
					anchor: {
						type: 'string',
						description:
							'Heading anchor (slug) of the section to read, e.g. "channels" (required)'
					}
				},
				required: ['document_id', 'anchor']
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
						enum: ['task', 'plan', 'goal', 'milestone', 'document', 'risk'],
						description: 'Type of the source entity'
					},
					filter_kind: {
						type: 'string',
						enum: ['task', 'plan', 'goal', 'milestone', 'document', 'risk', 'all'],
						default: 'all',
						description: 'Filter to specific entity type, or "all" for everything'
					}
				},
				required: ['entity_id', 'entity_kind']
			}
		}
	}
];
