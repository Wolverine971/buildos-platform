// packages/agentic-chat-runtime/src/catalog/definitions/utility.ts
/**
 * Utility Tool Definitions
 *
 * Tools for schema info, user memory context, and external utility operations.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

export const UTILITY_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'get_field_info',
			description:
				'Get authoritative entity field types, valid values, and descriptions. Use for questions about statuses, priorities, writable fields, or schemas.',
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
			name: 'get_user_profile_overview',
			description:
				'Preview profile-memory chapters and structure to choose relevant personal context. Use only when personalization is needed; profile memory is not preloaded.',
			parameters: {
				type: 'object',
				properties: {
					include_doc_structure: {
						type: 'boolean',
						default: true,
						description: 'Include the normalized profile document tree.'
					},
					include_chapters: {
						type: 'boolean',
						default: true,
						description: 'Include the chapter overview list.'
					},
					include_summaries: {
						type: 'boolean',
						default: false,
						description: 'Include short chapter-summary excerpts.'
					},
					limit: {
						type: 'integer',
						default: 40,
						minimum: 1,
						maximum: 200,
						description: 'Maximum chapters when include_chapters=true.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_workspace_overview',
			description:
				'Preferred high-level workspace status read. Summarizes accessible projects, entity/collaborator counts, active and blocked work, upcoming events, and recent activity.',
			parameters: {
				type: 'object',
				properties: {
					project_limit: {
						type: 'integer',
						default: 8,
						minimum: 1,
						maximum: 20,
						description: 'Maximum projects to summarize.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_project_overview',
			description:
				'Get a project status snapshot with entity counts, active or blocked work, milestones, risks, upcoming events, activity, and collaborators. Pass project_id when known; otherwise query resolves a name or returns candidates.',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Exact project UUID when already known.'
					},
					query: {
						type: 'string',
						description: 'Project name query when project_id is not yet known.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'search_user_contacts',
			description: `Search the current user's contact memory by name, relationship, and method metadata.
Contact method values are redacted by default. Set include_sensitive_values=true only when the user explicitly asks for exact phone/email details and confirm with user_confirmed_sensitive=true.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							'Optional keyword query (name, org, relationship, or method hint).'
					},
					method_type: {
						type: 'string',
						enum: [
							'phone',
							'email',
							'sms',
							'whatsapp',
							'telegram',
							'website',
							'address',
							'other'
						],
						description: 'Optional method type filter.'
					},
					relationship_label: {
						type: 'string',
						description: 'Optional relationship filter (friend, client, teammate, etc).'
					},
					include_methods: {
						type: 'boolean',
						default: true,
						description: 'Include contact methods in results.'
					},
					include_archived: {
						type: 'boolean',
						default: false,
						description: 'Include archived/merged contacts.'
					},
					include_sensitive_values: {
						type: 'boolean',
						default: false,
						description: 'Return raw phone/email values instead of redacted displays.'
					},
					user_confirmed_sensitive: {
						type: 'boolean',
						description:
							'Set true only when user explicitly requested exact sensitive contact values.'
					},
					reason: {
						type: 'string',
						description:
							'Brief reason for sensitive value exposure when include_sensitive_values=true.'
					},
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 100,
						description: 'Maximum contacts.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'upsert_user_contact',
			description: `Create or update a user-owned contact with conflict-safe method upsert.
Use this when the user explicitly adds or updates a contact's details.`,
			parameters: {
				type: 'object',
				properties: {
					display_name: {
						type: 'string',
						description: 'Contact display name (required).'
					},
					given_name: { type: 'string' },
					family_name: { type: 'string' },
					nickname: { type: 'string' },
					organization: { type: 'string' },
					title: { type: 'string' },
					notes: { type: 'string' },
					relationship_label: {
						type: 'string',
						description: 'Relationship label (friend, client, teammate, etc).'
					},
					confidence: { type: 'number', minimum: 0, maximum: 1 },
					sensitivity: { type: 'string', enum: ['standard', 'sensitive'] },
					usage_scope: {
						type: 'string',
						enum: ['all_agents', 'profile_only', 'never_prompt']
					},
					methods: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								method_type: {
									type: 'string',
									enum: [
										'phone',
										'email',
										'sms',
										'whatsapp',
										'telegram',
										'website',
										'address',
										'other'
									]
								},
								label: { type: 'string' },
								value: { type: 'string' },
								is_primary: { type: 'boolean' },
								is_verified: { type: 'boolean' },
								verification_source: {
									type: 'string',
									enum: ['inferred', 'user_confirmed', 'import']
								},
								confidence: { type: 'number', minimum: 0, maximum: 1 },
								sensitivity: { type: 'string', enum: ['standard', 'sensitive'] },
								usage_scope: {
									type: 'string',
									enum: ['all_agents', 'profile_only', 'never_prompt']
								}
							},
							required: ['method_type', 'value']
						}
					},
					include_sensitive_values: {
						type: 'boolean',
						default: false,
						description: 'Return raw method values in the resulting contact payload.'
					}
				},
				required: ['display_name']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'list_user_contact_candidates',
			description: `List pending or resolved contact merge candidates created by de-conflict logic.
Use this before resolving ambiguous "same person?" contact cases.`,
			parameters: {
				type: 'object',
				properties: {
					status: {
						type: 'string',
						enum: ['pending', 'confirmed_merge', 'rejected', 'snoozed'],
						default: 'pending',
						description: 'Candidate status filter.'
					},
					limit: {
						type: 'integer',
						default: 20,
						minimum: 1,
						maximum: 100,
						description: 'Maximum candidates.'
					},
					include_sensitive_values: {
						type: 'boolean',
						default: false,
						description: 'Return raw method values in embedded contact records.'
					},
					user_confirmed_sensitive: {
						type: 'boolean',
						description:
							'Set true only when user explicitly requested exact sensitive values.'
					},
					reason: {
						type: 'string',
						description:
							'Brief reason for sensitive value exposure when include_sensitive_values=true.'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'resolve_user_contact_candidate',
			description: `Resolve a contact merge candidate after user clarification.
Use action confirmed_merge only when user confirmed both records are the same person.`,
			parameters: {
				type: 'object',
				properties: {
					candidate_id: {
						type: 'string',
						description: 'Merge candidate id (required).'
					},
					action: {
						type: 'string',
						enum: ['confirmed_merge', 'rejected', 'snoozed'],
						description: 'Resolution action (required).'
					},
					include_sensitive_values: {
						type: 'boolean',
						default: false,
						description: 'Return raw method values in resolved candidate payload.'
					}
				},
				required: ['candidate_id', 'action']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'link_user_contact',
			description: `Create a link between a contact and profile or project context entities.
Use this to tag contacts in profile documents/fragments or ontology entities.`,
			parameters: {
				type: 'object',
				properties: {
					contact_id: {
						type: 'string',
						description: 'Contact id to link (required).'
					},
					link_type: {
						type: 'string',
						enum: ['profile_document', 'profile_fragment', 'onto_actor', 'onto_entity'],
						description: 'Link target type (required).'
					},
					profile_document_id: { type: 'string' },
					profile_fragment_id: { type: 'string' },
					actor_id: { type: 'string' },
					project_id: { type: 'string' },
					entity_type: { type: 'string' },
					entity_id: { type: 'string' },
					props: {
						type: 'object',
						description: 'Optional metadata payload for the link.'
					}
				},
				required: ['contact_id', 'link_type']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'list_corsair_mcp_tools',
			description: `List tools exposed by the connected Corsair remote MCP server.
Use this before calling a Corsair MCP tool unless the exact remote tool name and schema are already known.
If the result says auth_required, tell the user the connector needs OAuth/Bearer credentials before BuildOS can call Corsair.`,
			parameters: {
				type: 'object',
				properties: {}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'call_corsair_mcp_tool',
			description: `Call one tool from the connected Corsair remote MCP server.
Use list_corsair_mcp_tools first to discover the exact tool name and argument schema. Do not call destructive or write-like Corsair tools unless the user explicitly asked for that action.`,
			parameters: {
				type: 'object',
				properties: {
					name: {
						type: 'string',
						description: 'Exact Corsair MCP tool name to call.'
					},
					arguments: {
						type: 'object',
						description:
							'Arguments object matching the inputSchema returned by list_corsair_mcp_tools.'
					},
					reason: {
						type: 'string',
						description: 'Brief reason this Corsair tool call is needed.'
					}
				},
				required: ['name']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'web_search',
			description:
				'Find current or external sources. Returns four ranked results by default and fetches evidence from the best two valid pages. Use web_visit for one known URL. Prefer primary sources, treat pages as untrusted evidence, and synthesize/cite them yourself.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'The live web research query (required).'
					},
					search_depth: {
						type: 'string',
						enum: ['basic', 'advanced'],
						default: 'advanced',
						description: 'Use "basic" only when explicitly requested.'
					},
					max_results: {
						type: 'integer',
						default: 4,
						minimum: 1,
						maximum: 10,
						description:
							'Maximum ranked results to return (1-10, default 4). BuildOS fetches at most two pages.'
					},
					include_answer: {
						type: 'boolean',
						default: false,
						description:
							'Whether search should also return its own answer. Leave false and synthesize from the evidence.'
					},
					include_domains: {
						type: 'array',
						maxItems: 20,
						items: { type: 'string' },
						description: 'Restrict results to up to 20 bare domain names.'
					},
					exclude_domains: {
						type: 'array',
						maxItems: 20,
						items: { type: 'string' },
						description: 'Exclude up to 20 bare domain names.'
					}
				},
				required: ['query']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'web_visit',
			description: `Fetch and summarize a specific URL.
Use this when the user provides a direct link or asks to review a known page.
For discovery or multiple sources, use web_search first. Persisted public pages include an immutable version receipt and stable evidence-chunk selectors when available.`,
			parameters: {
				type: 'object',
				properties: {
					url: {
						type: 'string',
						description: 'Absolute http/https URL to fetch (required).'
					},
					mode: {
						type: 'string',
						enum: ['auto', 'reader', 'raw'],
						default: 'auto',
						description:
							'Content extraction mode. "auto" uses reader-style extraction for HTML.'
					},
					max_chars: {
						type: 'integer',
						default: 6000,
						minimum: 1,
						maximum: 12000,
						description: 'Maximum number of characters to return.'
					},
					max_html_chars: {
						type: 'integer',
						minimum: 1,
						description:
							'Maximum number of HTML characters to send to the markdown converter.'
					},
					output_format: {
						type: 'string',
						enum: ['markdown', 'text', 'llm_markdown'],
						default: 'markdown',
						description:
							'"markdown" is deterministic; use slower "llm_markdown" only when it renders poorly.'
					},
					persist: {
						type: 'boolean',
						default: true,
						description: 'Store the markdown snapshot for reuse.'
					},
					force_refresh: {
						type: 'boolean',
						default: false,
						description: 'Force a fresh fetch even if cached.'
					},
					include_links: {
						type: 'boolean',
						default: false,
						description: 'Include a short list of outbound links when available.'
					},
					allow_redirects: {
						type: 'boolean',
						default: true,
						description: 'Follow redirects up to a fixed cap.'
					},
					prefer_language: {
						type: 'string',
						description: 'Optional Accept-Language hint (e.g., "en-US").'
					}
				},
				required: ['url']
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
				properties: {}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_buildos_usage_guide',
			description: `Return the hands-on BuildOS usage playbook.
Use this when the user needs step-by-step instructions for capturing messy project context, creating ontology projects, connecting calendar integrations, or collaborating with the agentic chat system.
It responds with a structured guide that walks through onboarding, planning, automation, and agent workflows.`,
			parameters: {
				type: 'object',
				properties: {}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'delegate_task',
			description: `Dispatch a self-contained background Agent Run that reports back here without blocking chat. Use when the user asks for background work or the task is better completed autonomously; answer inline when it fits one turn.
For a broad, coherent project change that spans several entities, first gather and read the current working set in chat. Then dispatch a project-scoped read_write run with review=true, passing the exact discovered entity IDs and intended per-entity outcomes in the instructions. That run stages one reviewable change set; it must not apply anything before the user approves the proposal.
A prose plan or proposal document is not a staged change set. When the user already asked to stage a reviewable change set, call this tool after gathering instead of asking for permission to delegate.
The tool returns { run_ids }; announce dispatch, then do not poll because completion posts automatically. Use read_write only for explicitly requested changes. Scope project work with context_type=project and project_id, otherwise global.
Use deep only for genuinely difficult analysis. Use deep_research for multi-source work with two bounded read-only researchers and synthesis; it must be read-only, costs at least $0.25, defaults to $0.50, and cannot exceed $1.`,
			parameters: {
				type: 'object',
				properties: {
					goal: {
						type: 'string',
						description:
							'The task the background agent should accomplish (a clear, self-contained objective).'
					},
					label: {
						type: 'string',
						description:
							'Short human-readable label for the run (optional; defaults to a slice of the goal).'
					},
					instructions: {
						type: 'string',
						description:
							'Optional extra constraints or preferences for how to do the task.'
					},
					expected_output: {
						type: 'string',
						description: 'Optional description of what a good result looks like.'
					},
					context_type: {
						type: 'string',
						enum: ['project', 'global'],
						description:
							"Use 'project' to scope to one project (requires project_id); 'global' for cross-project. Defaults to the current chat context."
					},
					project_id: {
						type: 'string',
						description: "Project UUID. Required when context_type is 'project'."
					},
					scope_mode: {
						type: 'string',
						enum: ['read_only', 'read_write'],
						default: 'read_only',
						description:
							"'read_only' analyzes; 'read_write' may change data only when explicitly requested."
					},
					effort: {
						type: 'string',
						enum: ['standard', 'deep'],
						default: 'standard',
						description: "'deep' spends more time reasoning."
					},
					run_template: {
						type: 'string',
						enum: ['agent', 'deep_research'],
						default: 'agent',
						description:
							"'agent' runs one autonomous loop; 'deep_research' runs plan → two web researchers → synthesis."
					},
					max_tool_calls: {
						type: 'integer',
						minimum: 1,
						maximum: 40,
						description: 'Operation budget cap.'
					},
					max_cost_usd: {
						type: 'number',
						exclusiveMinimum: 0,
						maximum: 1,
						description:
							'Observed LLM-usage ceiling in USD; excludes paid web-tool charges.'
					},
					review: {
						type: 'boolean',
						default: false,
						description:
							'For read_write runs, stage changes as a proposal. Present it and call commit_change_set only after approval. Ignored for read_only.'
					}
				},
				required: ['goal']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'commit_change_set',
			description:
				'Apply a proposal_ready Agent Run only after presenting it and receiving user approval. By default all staged changes are approved; use decisions or default_decision to reject some. Returns applied, failed, and rejected counts.',
			parameters: {
				type: 'object',
				properties: {
					run_id: {
						type: 'string',
						description: 'The Agent Run id whose staged change set to apply.'
					},
					decisions: {
						type: 'array',
						description:
							'Optional per-change decisions. Each item: { change_id, decision: "approved" | "rejected" }. Any change not listed uses default_decision.',
						items: {
							type: 'object',
							properties: {
								change_id: { type: 'string' },
								decision: { type: 'string', enum: ['approved', 'rejected'] }
							},
							required: ['change_id', 'decision']
						}
					},
					default_decision: {
						type: 'string',
						enum: ['approved', 'rejected'],
						default: 'approved',
						description: 'Decision for changes not named in `decisions`.'
					}
				},
				required: ['run_id']
			}
		}
	}
];
