// apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts
/**
 * Ontology Write Tool Definitions
 *
 * Tools for mutating ontology entities: create_*, update_*, delete_* operations.
 * These tools modify data in the ontology system.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

export const ONTOLOGY_WRITE_TOOLS: ChatToolDefinition[] = [
	// ============================================
	// CREATE TOOLS
	// ============================================

	{
		type: 'function',
		function: {
			name: 'create_onto_task',
			description: `Create a new task in the ontology system.
Creates a task within a project and optionally assigns it to a plan.
Automatically creates containment edges based on parent inputs (plan/goal/project).

**CRITICAL: When to create tasks vs. when NOT to:**

CREATE a task when:
- The USER explicitly asks to "add a task", "create a task", "track this", or "remind me to"
- The work requires HUMAN action (phone calls, meetings, reviews, approvals)
- The work must happen OUTSIDE this conversation (external results, future actions)
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
							'Initial state (default: todo). Valid: todo, in_progress, blocked, done'
					},
					priority: {
						type: 'number',
						description: 'Priority level (1-5, default: 3). Higher = more important'
					},
					plan_id: {
						type: 'string',
						description: 'Optional plan UUID to associate this task with'
					},
					goal_id: {
						type: 'string',
						description: 'Optional goal UUID that this task supports'
					},
					supporting_milestone_id: {
						type: 'string',
						description: 'Optional milestone UUID this task targets'
					},
					parent: {
						type: 'object',
						description:
							'Optional parent reference for containment (preferred over plan_id/goal_id)',
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
						description:
							'Optional relationship connections (use for documents, tasks, risks, or explicit rels)',
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
						description: 'Optional start date in ISO format (when work should begin)'
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
					type_key: {
						type: 'string',
						default: 'document.default',
						description: `Document type taxonomy (required): document.{family}[.{variant}]
Families: context (project/brief), knowledge (research/brain_dump), notes (meeting_notes/rfc), spec (product/technical), reference (handbook/sop), intake (client/project).
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
						type: 'string',
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
Use this to connect plans, goals, milestones, tasks, documents, risks, or requirements.
Avoid creating project edges unless the entity is truly a root-level item.`,
			parameters: {
				type: 'object',
				properties: {
					src_kind: {
						type: 'string',
						description:
							'Source entity kind (project, plan, goal, milestone, task, document, risk, requirement, metric, source)'
					},
					src_id: {
						type: 'string',
						description: 'Source entity UUID'
					},
					dst_kind: {
						type: 'string',
						description:
							'Destination entity kind (project, plan, goal, milestone, task, document, risk, requirement, metric, source)'
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
			name: 'move_document',
			description: `Move a document to a new location in the hierarchical document tree.
Use to reorganize document structure, moving documents between folders or to root level.
Cannot move a folder into its own descendant (would create a cycle).`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID (optional; inferred from context if omitted)'
					},
					document_id: {
						type: 'string',
						description: 'Document ID to move (required)'
					},
					new_parent_id: {
						anyOf: [{ type: 'string' }, { type: 'null' }],
						description: 'New parent document ID, or null to move to root level'
					},
					position: {
						type: 'number',
						description: 'Position among siblings (0-indexed, default: 0)'
					}
				},
				required: ['document_id', 'new_parent_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'reorganize_onto_project_graph',
			description: `Reorganize part of a project graph by providing a node-centric structure.
Accepts nodes with desired connections and applies auto-organization rules to reparent and relink edges.
Use dry_run to preview edge changes before applying.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID to reorganize'
					},
					nodes: {
						type: 'array',
						description: 'Entities to reorganize with desired connections',
						minItems: 1,
						items: {
							type: 'object',
							properties: {
								id: { type: 'string', description: 'Entity UUID' },
								kind: { type: 'string', description: 'Entity kind' },
								connections: {
									type: 'array',
									items: {
										type: 'object',
										properties: {
											kind: {
												type: 'string',
												description: 'Connection kind'
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
			description: `Create a new project in the ontology system with full structure.

This is the PRIMARY tool for creating projects. It uses **entities + relationships only**
to build the project graph:
- Entities represent goals, plans, tasks, documents, risks, requirements, etc.
- Relationships are directional pairs that drive containment + semantic edges.
- Context document linkage (document.context.project) is supported.
- Documents created here (including the context document) are added to the project's doc_structure at root level unless moved later.

**IMPORTANT**: Extract what the user explicitly mentioned. Don't add structure they didn't ask for:
- Project name from context
- Appropriate type_key classification using project.{realm}.{domain}[.{variant}]
- Start date (default to today if not specified)
- Facets (context, scale, stage) from user intent
- Props extracted from user's message - CRITICAL!

**Start Simple (CRITICAL):**
- Most new projects just need: project + 1 goal (if an outcome is stated) + maybe a few tasks (if explicit actions are mentioned)
- Don't add plans/milestones unless user mentions phases, dates, or workstreams
- Don't add peripheral entities (risks, documents, requirements, metrics, sources) unless explicitly mentioned
- Simple projects are GOOD - structure grows over time

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
When using clarifications, still include entities: [] and relationships: [] in the payload.

**Workflow**:
1. Infer the right type_key from taxonomy (project.creative.book, project.technical.app, etc.)
2. Extract props from the user's message using prop naming guidance
3. Fill in ProjectSpec with inferred data AND extracted props
4. Add clarifications[] only if essential info is missing
5. Call this tool with the complete spec

**Examples (Start Simple):**

SIMPLE PROJECT (just a goal, no tasks - most common for new projects):
{
  "project": { "name": "Learn Spanish", "type_key": "project.education.skill" },
  "entities": [{ "temp_id": "g1", "kind": "goal", "name": "Conversational fluency" }],
  "relationships": []
}

PROJECT WITH TASKS (user mentioned specific actions):
{
  "project": { "name": "Product Launch", "type_key": "project.business.product_launch" },
  "entities": [
    { "temp_id": "g1", "kind": "goal", "name": "Launch MVP by Q2" },
    { "temp_id": "t1", "kind": "task", "title": "Schedule kickoff meeting" },
    { "temp_id": "t2", "kind": "task", "title": "Review vendor proposals" }
  ],
  "relationships": [
    [{ "temp_id": "g1", "kind": "goal" }, { "temp_id": "t1", "kind": "task" }],
    [{ "temp_id": "g1", "kind": "goal" }, { "temp_id": "t2", "kind": "task" }]
  ]
}

PROJECT WITH PHASES (user mentioned workstreams):
{
  "project": { "name": "Wedding Planning", "type_key": "project.service.event" },
  "entities": [
    { "temp_id": "g1", "kind": "goal", "name": "Perfect wedding day" },
    { "temp_id": "p1", "kind": "plan", "name": "Venue & Catering" },
    { "temp_id": "p2", "kind": "plan", "name": "Guest Management" }
  ],
  "relationships": [
    [{ "temp_id": "g1", "kind": "goal" }, { "temp_id": "p1", "kind": "plan" }],
    [{ "temp_id": "g1", "kind": "goal" }, { "temp_id": "p2", "kind": "plan" }]
  ]
}

**ProjectSpec Structure (entities + relationships only)**:
{
  project: {
    name: string (REQUIRED - infer from user message),
    type_key: string (REQUIRED - classify via project.{realm}.{domain}[.{variant}]),
    description?: string (infer from user message),
    state_key?: string (default: "planning", valid: planning|active|completed|cancelled),
    props?: { facets?: { context?, scale?, stage? } },
    start_at?: ISO datetime (default to now),
    end_at?: ISO datetime
  },
  entities: [
    { temp_id: string, kind: "goal|milestone|plan|task|document|risk|requirement|metric|source", ... }
  ],
  relationships: [
    [ { temp_id, kind }, { temp_id, kind } ],
    { from: { temp_id, kind }, to: { temp_id, kind }, rel?, intent? }
  ],
  context_document?: { title: string, content: string, props? },
  clarifications?: [{ key, question, required, choices?, help_text? }],
  meta?: { model, confidence, suggested_facets } (NOT sent to API)
}

Relationships are directional: [from, to] treats "from" as the entity being created/updated and "to" as its connection.
entities + relationships are required even if empty (use [] for no links or clarifications).`,
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
									'Type classification (REQUIRED). Must use project.{realm}.{domain}[.{variant}] format with 3-4 segments. Realm MUST be one of: creative, technical, business, service, education, personal. Examples: "project.business.product_launch", "project.creative.book", "project.technical.app.mobile". Use the "What does success look like?" test to pick the right realm.'
							},
							description: {
								type: 'string',
								description:
									'Project description (optional - infer from user message)'
							},
							state_key: {
								type: 'string',
								description:
									'Initial state (optional, defaults to "planning"). Valid: planning, active, completed, cancelled.'
							},
							props: {
								type: 'object',
								description: `CRITICAL: Properties extracted from the user's message.

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
					entities: {
						type: 'array',
						default: [],
						description:
							'Required entity list using temp_id + kind. Use entities + relationships only.',
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
							'Directional connections between entities using temp_id (required even if empty). Each item can be [from, to] or { from, to, rel?, intent? }.',
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
											kind: { type: 'string' }
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
												kind: { type: 'string' }
											},
											required: ['temp_id', 'kind']
										},
										to: {
											type: 'object',
											properties: {
												temp_id: { type: 'string' },
												kind: { type: 'string' }
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
						description:
							'Canonical context document (document.context.project) that will be linked to the project.',
						properties: {
							title: { type: 'string' },
							content: {
								type: 'string',
								description:
									'Markdown body with the user braindump/overview (stored in content column)'
							},
							type_key: {
								type: 'string',
								description: 'Defaults to document.context.project'
							},
							state_key: {
								type: 'string',
								description:
									'Document state (defaults to draft). Valid: draft, in_review, ready, published, archived.'
							},
							props: {
								type: 'object',
								description: 'Additional metadata (e.g., spark notes, tags)'
							}
						},
						required: ['title', 'content']
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
Can modify title, description, state, priority, scheduling, and custom properties.
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
						description: 'New state (todo, in_progress, blocked, done)'
					},
					priority: {
						type: 'number',
						description: 'New priority (1-5)'
					},
					goal_id: {
						type: 'string',
						description: 'Optional goal UUID that this task supports (null clears)'
					},
					supporting_milestone_id: {
						type: 'string',
						description: 'Optional milestone UUID this task targets (null clears)'
					},
					start_at: {
						type: 'string',
						description: 'New start date (ISO format) or null to clear'
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
						description: 'New state (planning, active, completed, cancelled)'
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
						description: 'Document state (draft, in_review, ready, published, archived)'
					},
					content: {
						type: 'string',
						description: 'Markdown content to store in the content column'
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
	{
		type: 'function',
		function: {
			name: 'update_onto_milestone',
			description: `Update an existing ontology milestone.
Use for edits to title, due date, state, or metadata.`,
			parameters: {
				type: 'object',
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
	{
		type: 'function',
		function: {
			name: 'update_onto_requirement',
			description: `Update an existing ontology requirement.
Use for edits to requirement text, priority, or metadata.`,
			parameters: {
				type: 'object',
				properties: {
					requirement_id: {
						type: 'string',
						description: 'Requirement UUID (required)'
					},
					text: {
						type: 'string',
						description: 'Requirement text'
					},
					priority: {
						type: 'number',
						description: 'Requirement priority'
					},
					type_key: {
						type: 'string',
						description: 'Requirement type key'
					},
					props: {
						type: 'object',
						description: 'Metadata fields to merge into requirement props'
					}
				},
				required: ['requirement_id']
			}
		}
	},

	// ============================================
	// DELETE TOOLS
	// ============================================

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
];
