// apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts
/**
 * Ontology Write Tool Definitions
 *
 * Tools for mutating ontology entities: create_*, update_*, delete_* operations.
 * These tools modify data in the ontology system.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

export const ONTOLOGY_WRITE_TOOLS = [
	// ============================================
	// CREATE TOOLS
	// ============================================

	{
		type: 'function',
		function: {
			name: 'create_onto_task',
			description: `Create a new task in the ontology system.
Creates a task within a project and optionally assigns it to a plan and collaborators.
Use when the user explicitly asks to add/track/remind, or when the item is future human work outside this chat.
Do not create tasks for research, brainstorming, summarizing, or drafting you can do now; do the work instead.
Always include project_id and a concrete title. Link to parent/plan/goal/milestone only when known. Use assignees only for known project members.
Load task_management for complex task flows.`,
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID'
					},
					title: {
						type: 'string',
						description: 'Task title'
					},
					description: {
						type: 'string',
						description: 'Task description'
					},
					type_key: {
						type: 'string',
						default: 'task.execute',
						description: 'Task type key. Default task.execute.'
					},
					state_key: {
						type: 'string',
						default: 'todo',
						description: 'Initial state. Valid: todo, in_progress, blocked, done'
					},
					priority: {
						type: 'number',
						description: 'Priority 1-5. Default 3.'
					},
					assignee_actor_ids: {
						type: 'array',
						description: 'Active project member actor UUIDs. Max 10.',
						items: { type: 'string' }
					},
					assignee_handles: {
						type: 'array',
						description: 'Active project member handles, e.g. @dj.',
						items: { type: 'string' }
					},
					plan_id: {
						type: 'string',
						description: 'Optional plan UUID'
					},
					goal_id: {
						type: 'string',
						description: 'Optional goal UUID'
					},
					supporting_milestone_id: {
						type: 'string',
						description: 'Optional milestone UUID'
					},
					parent: {
						type: 'object',
						description: 'Optional primary containment parent',
						properties: {
							kind: { type: 'string' },
							id: { type: 'string' },
							is_primary: { type: 'boolean' }
						}
					},
					parents: {
						type: 'array',
						description: 'Optional containment parents',
						items: {
							type: 'object',
							properties: {
								kind: { type: 'string' },
								id: { type: 'string' },
								is_primary: { type: 'boolean' }
							}
						}
					},
					connections: {
						type: 'array',
						description: 'Optional semantic or containment links',
						items: {
							type: 'object',
							properties: {
								kind: { type: 'string' },
								id: { type: 'string' },
								intent: { type: 'string', enum: ['containment', 'semantic'] },
								rel: { type: 'string' }
							}
						}
					},
					start_at: {
						type: 'string',
						description: 'ISO start date'
					},
					due_at: {
						type: 'string',
						description: 'ISO due date'
					},
					props: {
						type: 'object',
						description: 'Additional JSON properties'
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
Plans are execution structures that turn a goal or milestone into a taskable timeline.`,
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
						description: 'Short plan synopsis'
					},
					plan: {
						type: 'string',
						description:
							'Detailed plan body. Use this for the durable source-of-truth plan: objective, scope, success criteria, timeline, dependencies, risks, and task breakdown.'
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
						description: 'Initial state (draft, active, completed)'
					},
					props: {
						type: 'object',
						description: 'Additional properties'
					},
					goal_id: {
						type: 'string',
						description: 'Optional goal UUID this plan supports/contains'
					},
					milestone_id: {
						type: 'string',
						description: 'Optional milestone UUID this plan is nested under'
					},
					parent: {
						type: 'object',
						description: 'Optional parent reference for containment',
						properties: {
							kind: { type: 'string' },
							id: { type: 'string' },
							is_primary: { type: 'boolean' }
						}
					},
					parents: {
						type: 'array',
						description: 'Optional multiple containment parents',
						items: {
							type: 'object',
							properties: {
								kind: { type: 'string' },
								id: { type: 'string' },
								is_primary: { type: 'boolean' }
							}
						}
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
Use for briefs, specs, context docs, or research artifacts linked to a project.
Documents are organized in a hierarchical tree structure. Use parent_id to place the document under a parent folder.`,
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
					description: {
						type: 'string',
						description: 'Short summary of the document (required)'
					},
					type_key: {
						type: 'string',
						default: 'document.default',
						description: `Document type taxonomy (required): document.{family}[.{variant}]
Families: context (project/brief), knowledge (research), notes (meeting_notes/rfc), spec (product/technical), reference (handbook/sop), intake (client/project).
Examples: document.context.project, document.knowledge.research, document.spec.technical`
					},
					state_key: {
						type: 'string',
						description:
							'Document state (draft, in_review, ready, published, archived)',
						default: 'draft'
					},
					content: {
						type: 'string',
						description: 'Markdown body content stored in the content column'
					},
					props: {
						type: 'object',
						description: 'Additional properties/metadata'
					},
					parent_id: {
						type: ['string', 'null'],
						description:
							'Parent document ID to place this document under in the tree hierarchy. Null or omitted places at root level.'
					},
					position: {
						type: 'number',
						description: 'Position among siblings (0-indexed). Omit to place at end.'
					},
					parent: {
						type: 'object',
						description: 'Optional parent reference for semantic linking (legacy)',
						properties: {
							kind: { type: 'string' },
							id: { type: 'string' },
							is_primary: { type: 'boolean' }
						}
					},
					parents: {
						type: 'array',
						description: 'Optional multiple semantic parents (legacy)',
						items: {
							type: 'object',
							properties: {
								kind: { type: 'string' },
								id: { type: 'string' },
								is_primary: { type: 'boolean' }
							}
						}
					}
				},
				required: ['project_id', 'title', 'description']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_onto_milestone',
			description: `Create a new milestone in the ontology system.
Milestones mark major checkpoints and should usually connect to a goal.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					},
					title: {
						type: 'string',
						description: 'Milestone title (required)'
					},
					goal_id: {
						type: 'string',
						description: 'Goal UUID to link this milestone to'
					},
					due_at: {
						type: 'string',
						description: 'Due date in ISO format'
					},
					state_key: {
						type: 'string',
						description: 'Initial state (pending, in_progress, completed, missed)'
					},
					description: {
						type: 'string',
						description: 'Milestone description'
					},
					milestone: {
						type: 'string',
						description: 'Optional milestone subtitle/label'
					},
					props: {
						type: 'object',
						description: 'Additional properties/metadata'
					},
					parent: {
						type: 'object',
						description: 'Optional parent reference for containment',
						properties: {
							kind: { type: 'string' },
							id: { type: 'string' },
							is_primary: { type: 'boolean' }
						}
					},
					parents: {
						type: 'array',
						description: 'Optional multiple containment parents',
						items: {
							type: 'object',
							properties: {
								kind: { type: 'string' },
								id: { type: 'string' },
								is_primary: { type: 'boolean' }
							}
						}
					},
					connections: {
						type: 'array',
						description: 'Optional relationship connections',
						items: {
							type: 'object',
							properties: {
								kind: { type: 'string' },
								id: { type: 'string' },
								intent: { type: 'string', enum: ['containment', 'semantic'] },
								rel: { type: 'string' }
							}
						}
					}
				},
				required: ['project_id', 'title']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_onto_risk',
			description: `Create a new risk in the ontology system.
Risks capture potential issues and mitigation planning.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					},
					title: {
						type: 'string',
						description: 'Risk title (required)'
					},
					impact: {
						type: 'string',
						description: 'Impact level (required): low, medium, high, critical'
					},
					probability: {
						type: 'number',
						description: 'Probability value between 0 and 1'
					},
					state_key: {
						type: 'string',
						description: 'Initial state (identified, mitigated, occurred, closed)'
					},
					content: {
						type: 'string',
						description: 'Risk content summary'
					},
					description: {
						type: 'string',
						description: 'Risk description'
					},
					mitigation_strategy: {
						type: 'string',
						description: 'Mitigation strategy'
					},
					props: {
						type: 'object',
						description: 'Additional properties/metadata'
					},
					parent: {
						type: 'object',
						description: 'Optional parent reference for containment',
						properties: {
							kind: { type: 'string' },
							id: { type: 'string' },
							is_primary: { type: 'boolean' }
						}
					},
					parents: {
						type: 'array',
						description: 'Optional multiple containment parents',
						items: {
							type: 'object',
							properties: {
								kind: { type: 'string' },
								id: { type: 'string' },
								is_primary: { type: 'boolean' }
							}
						}
					},
					connections: {
						type: 'array',
						description: 'Optional relationship connections',
						items: {
							type: 'object',
							properties: {
								kind: { type: 'string' },
								id: { type: 'string' },
								intent: { type: 'string', enum: ['containment', 'semantic'] },
								rel: { type: 'string' }
							}
						}
					}
				},
				required: ['project_id', 'title', 'impact']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'move_document_in_tree',
			description: `Move or insert an existing document within the project's doc_structure.
Use this to nest existing or unlinked documents under a parent or reorder siblings.
If new_parent_id is null or omitted, the document is placed at root level.
Always pass the exact document_id from get_document_tree/list_onto_documents (do not pass document titles).`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					},
					document_id: {
						type: 'string',
						description: 'Document UUID to move (required)'
					},
					new_parent_id: {
						type: ['string', 'null'],
						description:
							'New parent document ID (null or omitted places the document at root level).'
					},
					new_position: {
						type: 'number',
						default: 0,
						description: 'Position among siblings (0-indexed). Omit to place at top.'
					}
				},
				required: ['project_id', 'document_id']
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
					description: {
						type: 'string',
						description: 'Short summary of the document (required if creating new)'
					},
					type_key: {
						type: 'string',
						description: 'Document type key (required if creating new)'
					},
					state_key: {
						type: 'string',
						description:
							'Document state (draft, in_review, ready, published, archived)',
						default: 'draft'
					},
					role: {
						type: 'string',
						description: 'Edge role (e.g., primary, scratch)'
					},
					content: {
						type: 'string',
						description: 'Markdown body content stored in the content column'
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

	{
		type: 'function',
		function: {
			name: 'link_onto_entities',
			description: `Create a relationship edge between two ontology entities.
Use this to connect plans, goals, milestones, tasks, documents, or risks.
Avoid creating project edges unless the entity is truly a root-level item.

If you provide a non-standard relationship type, the API will normalize it to a canonical relationship and preserve your original value in edge props.original_rel.`,
			parameters: {
				type: 'object',
				properties: {
					src_kind: {
						type: 'string',
						description:
							'Source entity kind (project, plan, goal, milestone, task, document, risk, metric, source)'
					},
					src_id: {
						type: 'string',
						description: 'Source entity UUID'
					},
					dst_kind: {
						type: 'string',
						description:
							'Destination entity kind (project, plan, goal, milestone, task, document, risk, metric, source)'
					},
					dst_id: {
						type: 'string',
						description: 'Destination entity UUID'
					},
					rel: {
						type: 'string',
						description:
							'Relationship type (e.g., supports_goal, targets_milestone, references, has_milestone, addresses, mitigates)'
					},
					props: {
						type: 'object',
						description: 'Optional edge metadata as JSON object'
					}
				},
				required: ['src_kind', 'src_id', 'dst_kind', 'dst_id', 'rel']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'unlink_onto_edge',
			description: `Remove a relationship edge by its ID.`,
			parameters: {
				type: 'object',
				properties: {
					edge_id: {
						type: 'string',
						description: 'Edge UUID to delete'
					}
				},
				required: ['edge_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'reorganize_onto_project_graph',
			description: `Reorganize part of a project graph by providing a node-centric structure.
Accepts nodes with desired connections and applies auto-organization rules to reparent and relink edges.
Use dry_run to preview edge changes before applying.
IMPORTANT: Do not include documents. Documents are flat and managed only via onto_projects.doc_structure; this tool must not create or modify document edges.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID to reorganize'
					},
					nodes: {
						type: 'array',
						description:
							'Non-document entities to reorganize with desired connections (documents are excluded)',
						minItems: 1,
						items: {
							type: 'object',
							properties: {
								id: { type: 'string', description: 'Entity UUID' },
								kind: {
									type: 'string',
									description:
										'Entity kind (project, plan, goal, milestone, task, risk, metric, source). Document is not allowed.'
								},
								connections: {
									type: 'array',
									items: {
										type: 'object',
										properties: {
											kind: {
												type: 'string',
												description:
													'Connection kind (project, plan, goal, milestone, task, risk, metric, source). Document is not allowed.'
											},
											id: {
												type: 'string',
												description: 'Connection entity UUID'
											},
											intent: {
												type: 'string',
												enum: ['containment', 'semantic']
											},
											rel: { type: 'string' }
										}
									}
								},
								mode: { type: 'string', enum: ['replace', 'merge'] },
								semantic_mode: {
									type: 'string',
									enum: ['replace_auto', 'merge', 'preserve']
								},
								allow_project_fallback: { type: 'boolean' },
								allow_multi_parent: { type: 'boolean' }
							},
							required: ['id', 'kind']
						}
					},
					options: {
						type: 'object',
						description: 'Global defaults for node options',
						properties: {
							mode: { type: 'string', enum: ['replace', 'merge'] },
							semantic_mode: {
								type: 'string',
								enum: ['replace_auto', 'merge', 'preserve']
							},
							allow_project_fallback: { type: 'boolean' },
							allow_multi_parent: { type: 'boolean' },
							dry_run: { type: 'boolean' }
						}
					}
				},
				required: ['project_id', 'nodes']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_onto_project',
			description: `Create a project from a ProjectSpec. Always include project, entities, relationships; use [] when empty.
Hard rules: project.type_key starts with project. e.g. project.creative.novel. Entity labels: goal/plan/metric name; task/milestone/document/risk title; requirement text; source uri. Milestone needs due_at.
Infer name/type_key when clear; ask one clarification only if too vague. Start minimal: one goal for an explicit outcome, tasks for explicit actions, plans/milestones only for phases, dates, or workstreams.
Extract concrete details into description/props. Use temp_id + kind refs for relationships.`,
			parameters: {
				type: 'object',
				properties: {
					project: {
						type: 'object',
						description: 'Project definition',
						properties: {
							name: {
								type: 'string',
								description: 'Project name'
							},
							type_key: {
								type: 'string',
								description: 'Starts with project.; e.g. project.creative.novel.'
							},
							description: {
								type: 'string',
								description: 'Project description'
							},
							state_key: {
								type: 'string',
								description:
									'Initial state. Valid: planning, active, completed, cancelled.'
							},
							props: {
								type: 'object',
								description: 'Optional JSONB properties from the user message.',
								properties: {
									facets: {
										type: 'object',
										description: 'Optional standard facets',
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
								description: 'ISO start date'
							},
							end_at: {
								type: 'string',
								description: 'ISO end date'
							}
						},
						required: ['name', 'type_key']
					},
					entities: {
						type: 'array',
						default: [],
						description:
							'Entity list. Labels: goal/plan/metric name; task/milestone/document/risk title; requirement text; source uri.',
						items: {
							type: 'object',
							properties: {
								temp_id: { type: 'string' },
								kind: {
									type: 'string',
									enum: [
										'goal',
										'milestone',
										'plan',
										'task',
										'document',
										'risk',
										'metric',
										'source'
									]
								},
								name: { type: 'string' },
								title: { type: 'string' },
								text: { type: 'string' },
								description: { type: 'string' },
								target_date: { type: 'string' },
								measurement_criteria: { type: 'string' },
								priority: { type: 'number' },
								due_at: { type: 'string' },
								start_at: { type: 'string' },
								start_date: { type: 'string' },
								end_date: { type: 'string' },
								body_markdown: { type: 'string' },
								impact: { type: 'string' },
								probability: { type: 'number' },
								content: { type: 'string' },
								unit: { type: 'string' },
								definition: { type: 'string' },
								target_value: { type: 'number' },
								uri: { type: 'string' },
								snapshot_uri: { type: 'string' },
								type_key: { type: 'string' },
								state_key: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['temp_id', 'kind']
						}
					},
					relationships: {
						type: 'array',
						default: [],
						description:
							'Required directional temp_id connections between entities defined in the entities array. The project itself is implicit and must NOT be a relationship endpoint. Items can be [from, to] or { from, to, rel?, intent? }.',
						items: {
							oneOf: [
								{
									type: 'array',
									minItems: 2,
									maxItems: 2,
									items: {
										type: 'object',
										properties: {
											temp_id: { type: 'string' },
											kind: {
												type: 'string',
												enum: [
													'goal',
													'milestone',
													'plan',
													'task',
													'document',
													'risk',
													'requirement',
													'metric',
													'source'
												]
											}
										},
										required: ['temp_id', 'kind']
									}
								},
								{
									type: 'object',
									properties: {
										from: {
											type: 'object',
											properties: {
												temp_id: { type: 'string' },
												kind: {
													type: 'string',
													enum: [
														'goal',
														'milestone',
														'plan',
														'task',
														'document',
														'risk',
														'requirement',
														'metric',
														'source'
													]
												}
											},
											required: ['temp_id', 'kind']
										},
										to: {
											type: 'object',
											properties: {
												temp_id: { type: 'string' },
												kind: {
													type: 'string',
													enum: [
														'goal',
														'milestone',
														'plan',
														'task',
														'document',
														'risk',
														'requirement',
														'metric',
														'source'
													]
												}
											},
											required: ['temp_id', 'kind']
										},
										rel: { type: 'string' },
										intent: {
											type: 'string',
											enum: ['containment', 'semantic']
										}
									},
									required: ['from', 'to']
								}
							]
						}
					},
					context_document: {
						type: 'object',
						description: 'Optional document.context.project linked to the project.',
						properties: {
							title: { type: 'string' },
							content: {
								type: 'string',
								description: 'Markdown body'
							},
							type_key: {
								type: 'string',
								description: 'Defaults to document.context.project'
							},
							state_key: {
								type: 'string',
								description: 'Document state'
							},
							props: {
								type: 'object',
								description: 'Additional metadata'
							}
						},
						required: ['title', 'content']
					},
					clarifications: {
						type: 'array',
						description: 'Optional critical missing-info questions',
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
						description: 'Generation metadata',
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
				required: ['project', 'entities', 'relationships']
			}
		}
	},

	// ============================================
	// UPDATE TOOLS
	// ============================================

	{
		type: 'function',
		function: {
			name: 'update_onto_task',
			description: `Update an existing task in the ontology system.
Can modify title, description, state, priority, assignees, scheduling, and custom properties.
Only updates fields that are provided - omitted fields remain unchanged.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task UUID (required)'
					},
					project_id: {
						type: 'string',
						description:
							'Optional project UUID used for assignee handle resolution. If omitted, the task project is resolved automatically.'
					},
					title: {
						type: 'string',
						description: 'New task title'
					},
					description: {
						type: 'string',
						description: 'New description'
					},
					type_key: {
						type: 'string',
						description:
							'Work mode taxonomy: task.{work_mode}[.{specialization}]. Modes: execute, create, refine, research, review, coordinate, admin, plan.'
					},
					state_key: {
						type: 'string',
						description: 'New state (todo, in_progress, blocked, done)'
					},
					priority: {
						type: 'number',
						description: 'New priority (1-5)'
					},
					assignee_actor_ids: {
						type: 'array',
						description:
							'Optional full replacement assignee actor ID list (UUIDs) for active project members only. Prefer assignee_handles unless IDs were just retrieved from project members. Use [] to clear assignees. Max 10.',
						items: { type: 'string' }
					},
					assignee_handles: {
						type: 'array',
						description:
							'Optional assignee handles like ["@jim"]. Resolved against active project members by name/email local-part.',
						items: { type: 'string' }
					},
					goal_id: {
						type: ['string', 'null'],
						description: 'Optional goal UUID that this task supports (null clears)'
					},
					supporting_milestone_id: {
						type: ['string', 'null'],
						description: 'Optional milestone UUID this task targets (null clears)'
					},
					start_at: {
						type: ['string', 'null'],
						description: 'New start date (ISO format) or null to clear'
					},
					due_at: {
						type: ['string', 'null'],
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
Can modify name, description, state, timeline dates, and custom properties.
Only updates fields that are provided.`,
			parameters: {
				type: 'object',
				additionalProperties: false,
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
						description: 'New state (planning, active, completed, cancelled)'
					},
					start_at: {
						type: ['string', 'null'],
						description: 'New project start date (ISO format) or null to clear'
					},
					end_at: {
						type: ['string', 'null'],
						description:
							'New project end date (ISO format) or null to clear. Use null when the project should have no end date.'
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
				additionalProperties: false,
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
Use for edits to plan names, detailed plan body, dates, status, or metadata.`,
			parameters: {
				type: 'object',
				additionalProperties: false,
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
						description: 'Short plan synopsis'
					},
					plan: {
						type: 'string',
						description:
							'Detailed plan body. Use this for the durable source-of-truth plan: objective, scope, success criteria, timeline, dependencies, risks, and task breakdown.'
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
						description: 'Plan state (draft, active, completed)'
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
			description: [
				'Update an existing ontology document.',
				'Use for edits to titles, states, body markdown, or metadata.',
				'For update_strategy "append" or "merge_llm", include non-empty content/body_markdown/markdown/body/text. merge_instructions alone is not content.',
				'Append example: update_onto_document({ document_id, content: "## Progress Updates\\n\\n- Chapter 2 complete...", update_strategy: "append", merge_instructions: "Append under Progress Updates; preserve existing sections." })'
			].join(' '),
			parameters: {
				type: 'object',
				additionalProperties: false,
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
						description: 'Document state (draft, in_review, ready, published, archived)'
					},
					content: {
						type: 'string',
						description:
							'Markdown content to store in the content column. Required when update_strategy is append or merge_llm.'
					},
					description: {
						type: 'string',
						description: 'Short summary of the document'
					},
					update_strategy: {
						type: 'string',
						description:
							"How to apply content: 'replace' (default), 'append', or 'merge_llm' to intelligently merge with existing content.",
						enum: ['replace', 'append', 'merge_llm'],
						default: 'replace'
					},
					merge_instructions: {
						type: 'string',
						description:
							'Optional guidance when merging content (e.g., keep headers, preserve tables, integrate research notes). Used with append/merge_llm, but does not replace the required content.'
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
	{
		type: 'function',
		function: {
			name: 'tag_onto_entity',
			description: `Tag one or more collaborators on an existing task, goal, or document without editing content.
Use this when the user explicitly asks to ping/tag someone (for example: "tag @jim on this document").`,
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					},
					entity_type: {
						type: 'string',
						enum: ['task', 'goal', 'document'],
						description: 'Entity type to tag on'
					},
					entity_id: {
						type: 'string',
						description: 'Entity UUID (required)'
					},
					mode: {
						type: 'string',
						enum: ['content', 'ping'],
						default: 'content',
						description:
							'Tag behavior mode. "content" appends canonical mention tokens to entity text (default). "ping" sends explicit notification without editing content.'
					},
					mentioned_user_ids: {
						type: 'array',
						description:
							'Optional explicit recipient user IDs (UUIDs). Recipients must be active project members.',
						items: { type: 'string' }
					},
					mentioned_handles: {
						type: 'array',
						description:
							'Optional @handles like ["@jim", "@dj"]. Handles resolve against active project members by name/email local-part.',
						items: { type: 'string' }
					},
					message: {
						type: 'string',
						description:
							'Optional short note appended to the notification body (for example: "please review section 2").'
					}
				},
				required: ['project_id', 'entity_type', 'entity_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_onto_milestone',
			description: `Update an existing ontology milestone.
Use for edits to title, due date, state, or metadata.`,
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					milestone_id: {
						type: 'string',
						description: 'Milestone UUID (required)'
					},
					title: {
						type: 'string',
						description: 'New milestone title'
					},
					due_at: {
						type: 'string',
						description: 'Milestone due date (ISO timestamp)'
					},
					state_key: {
						type: 'string',
						description: 'Milestone state (pending, in_progress, completed, missed)'
					},
					description: {
						type: 'string',
						description: 'Milestone description'
					},
					props: {
						type: 'object',
						description: 'Metadata fields to merge into milestone props'
					}
				},
				required: ['milestone_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_onto_risk',
			description: `Update an existing ontology risk.
Use for edits to title, impact, probability, state, or mitigation metadata.`,
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					risk_id: {
						type: 'string',
						description: 'Risk UUID (required)'
					},
					title: {
						type: 'string',
						description: 'New risk title'
					},
					impact: {
						type: 'string',
						description: 'Impact level (low, medium, high, critical)'
					},
					probability: {
						type: 'number',
						description: 'Probability (0-1)'
					},
					state_key: {
						type: 'string',
						description: 'Risk state (identified, mitigated, occurred, closed)'
					},
					content: {
						type: 'string',
						description: 'Risk content summary'
					},
					description: {
						type: 'string',
						description: 'Risk description'
					},
					mitigation_strategy: {
						type: 'string',
						description: 'Risk mitigation strategy'
					},
					owner: {
						type: 'string',
						description: 'Owner or responsible party'
					},
					props: {
						type: 'object',
						description: 'Metadata fields to merge into risk props'
					}
				},
				required: ['risk_id']
			}
		}
	},
	// ============================================
	// DELETE TOOLS
	// ============================================

	{
		type: 'function',
		function: {
			name: 'delete_onto_project',
			description: `Delete a project from the ontology system.
This action is permanent and removes the entire project workspace.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					}
				},
				required: ['project_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'delete_onto_task',
			description: `Delete (soft delete) a task from the ontology system.
Sets deleted_at timestamp to mark the task as deleted. The task is excluded from queries but can be recovered.
Preserves edge relationships for potential restoration.
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
			name: 'delete_onto_milestone',
			description: `Delete a milestone from the ontology system.
This action is permanent and cannot be undone.`,
			parameters: {
				type: 'object',
				properties: {
					milestone_id: {
						type: 'string',
						description: 'Milestone UUID (required)'
					}
				},
				required: ['milestone_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'delete_onto_risk',
			description: `Delete a risk from the ontology system.
This action is permanent and cannot be undone.`,
			parameters: {
				type: 'object',
				properties: {
					risk_id: {
						type: 'string',
						description: 'Risk UUID (required)'
					}
				},
				required: ['risk_id']
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
	}
] as ChatToolDefinition[];
