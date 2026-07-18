// apps/web/src/lib/services/agentic-chat/tools/core/definitions/utility.ts
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
			name: 'get_user_profile_overview',
			description: `Get a high-level overview of the current user's profile memory.
Returns profile sections/chapters and doc_structure so you can decide what personal context is relevant before using it.
Use this only when personalization is needed; user profile context is not preloaded into prompts.`,
			parameters: {
				type: 'object',
				properties: {
					include_doc_structure: {
						type: 'boolean',
						description: 'Include normalized profile doc_structure tree (default true).'
					},
					include_chapters: {
						type: 'boolean',
						description: 'Include chapter overview list (default true).'
					},
					include_summaries: {
						type: 'boolean',
						description:
							'Include short summary excerpts from chapters when available (default false).'
					},
					limit: {
						type: 'number',
						default: 40,
						maximum: 200,
						description: 'Max chapters to return when include_chapters=true (1-200).'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_workspace_overview',
			description: `Get a BuildOS-native workspace status summary across accessible projects.
Use this for questions like:
- "What is happening with my projects?"
- "What is blocked across my workspace?"
- "Give me a quick overview of what needs attention."
Returns workspace and per-project task/document/plan/goal/collaborator counts alongside active work, upcoming events, and recent activity.
This is the preferred high-level retrieval path for workspace status questions before generic search/list assembly.`,
			parameters: {
				type: 'object',
				properties: {
					project_limit: {
						type: 'number',
						default: 8,
						maximum: 20,
						description: 'Maximum number of projects to summarize (1-20).'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_project_overview',
			description: `Get a BuildOS-native status summary for one project.
Use this for questions like:
- "What's going on with 9takes?"
- "Give me the current status of this project."
- "What is blocked or due soon in this project?"
Returns the project status snapshot with task/document/plan/goal counts, active work, milestones, risks, upcoming events, recent activity, and active collaborators.
Pass project_id when known. If the user names a project but the ID is unknown, pass query and this op will try to resolve the project or return candidates.`,
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
			name: 'change_chat_context',
			description: `Change the durable chat context when the latest user request should strategically zoom into one project or zoom out to the workspace.

Use this early in the turn before answering when:
- The user explicitly asks to zoom, switch, focus, go to a project, or go back to all projects.
- The current context is global/workspace and the latest request is primarily about one identifiable project, so project tools should be loaded for the rest of the turn.
- The current context is one project and the latest request is clearly about a different project, and the user appears to be moving focus rather than doing a brief comparison.
- The user asks about all projects, workspace status, cross-project priorities, or wants to zoom out.

Do not use this for ambiguous project names, one-off comparisons across multiple projects, or brief mentions that can be answered from current context. For project zoom-in, pass project_id if known or project_query if the name needs resolution. Ambiguous or missing project matches return candidates and do not change context.`,
			parameters: {
				type: 'object',
				properties: {
					target: {
						type: 'string',
						enum: ['global', 'project'],
						description:
							'Target context. Use global for workspace/all-projects zoom-out. Use project for durable focus on one project.'
					},
					project_id: {
						type: 'string',
						description: 'Exact project UUID when zooming into a known project.'
					},
					project_query: {
						type: 'string',
						description:
							'Project name or phrase to resolve when zooming into a project and project_id is unknown.'
					},
					reason: {
						type: 'string',
						description:
							'Brief user-visible reason for the context change, grounded in the latest request.'
					}
				},
				required: ['target']
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
						description: 'Include contact methods in results (default true).'
					},
					include_archived: {
						type: 'boolean',
						description: 'Include archived/merged contacts (default false).'
					},
					include_sensitive_values: {
						type: 'boolean',
						description:
							'Return raw phone/email values instead of redacted displays (default false).'
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
						type: 'number',
						default: 20,
						maximum: 100,
						description: 'Maximum contacts to return (1-100).'
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
					confidence: { type: 'number' },
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
								confidence: { type: 'number' },
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
						description: 'Candidate status filter (default pending).'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 100,
						description: 'Maximum candidates to return (1-100).'
					},
					include_sensitive_values: {
						type: 'boolean',
						description:
							'Return raw method values in embedded contact records (default false).'
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
						description:
							'Return raw method values in resolved candidate payload (default false).'
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
			name: 'resolve_libri_resource',
			description: `Resolve a person or author through Libri, the durable library/enrichment system, before using generic web search.
Use this for stable knowledge questions like "tell me about James Clear", "who is Seth Godin?", or "what does Libri know about this author?"
This first BuildOS slice supports person/author resolution only. Do not use it for books, YouTube videos, current news, live facts, prices, laws, or schedules; use web_search for current/live web information.
Libri may return found, queued, pending, needs_input, configuration_error, resolver_unavailable, or error. If queued or pending, do not wait for enrichment.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Person or author name to resolve in Libri.'
					},
					types: {
						type: 'array',
						items: {
							type: 'string',
							enum: ['person']
						},
						description: 'Resource types to resolve. First slice supports only person.'
					},
					enqueue_if_missing: {
						type: 'boolean',
						description:
							'Whether Libri should queue person enrichment if no existing resource is found. Defaults to true.'
					},
					response_depth: {
						type: 'string',
						enum: ['hit_only', 'summary', 'detail'],
						description: 'Desired Libri response depth. Defaults to summary.'
					},
					project_id: {
						type: 'string',
						description: 'Optional BuildOS project id for Libri provenance only.'
					},
					reason: {
						type: 'string',
						description: 'Short reason BuildOS is asking Libri.'
					}
				},
				required: ['query']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'query_libri_library',
			description: `Query Libri's structured library API for durable library inventory and enriched research data.
Use this for questions like "search for books about habits", "list genres of books", "top 10 books in sales", "what authors do you have?", or "what YouTube videos have been ingested?"
This is a read-only Libri query tool. It does not enqueue research; use resolve_libri_resource when a person/author should be resolved and potentially queued for enrichment.`,
			parameters: {
				type: 'object',
				properties: {
					action: {
						type: 'string',
						enum: [
							'overview',
							'search',
							'search_books',
							'list_book_categories',
							'list_books_by_category',
							'list_authors',
							'get_author',
							'list_videos',
							'search_videos'
						],
						description: 'The structured Libri library query to run.'
					},
					query: {
						type: 'string',
						description:
							'Search text, author name, book title, or video title depending on action.'
					},
					category: {
						type: 'string',
						description: 'Book category, genre, or domain for list_books_by_category.'
					},
					types: {
						type: 'array',
						items: {
							type: 'string',
							enum: ['book', 'author', 'person', 'youtubeVideo', 'video']
						},
						description: 'Optional result types for the search action.'
					},
					limit: {
						type: 'number',
						description: 'Maximum number of rows to return. Defaults depend on action.'
					},
					response_depth: {
						type: 'string',
						enum: ['hit_only', 'summary', 'detail'],
						description:
							'Use detail when the answer needs related books, category examples, or richer author data.'
					}
				},
				required: ['action']
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
			description: `Perform a live web search using the Tavily API for current or external information not present in BuildOS.
Use this to discover sources or answer broad research questions. If the user provides a specific URL, use web_visit instead.
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
For discovery or multiple sources, use web_search first.`,
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
						description:
							'Content extraction mode. "auto" uses reader-style extraction for HTML.'
					},
					max_chars: {
						type: 'number',
						default: 6000,
						maximum: 12000,
						description: 'Maximum number of characters to return.'
					},
					max_html_chars: {
						type: 'number',
						description:
							'Maximum number of HTML characters to send to the markdown converter.'
					},
					output_format: {
						type: 'string',
						enum: ['markdown', 'text', 'llm_markdown'],
						description:
							'Output format. "markdown" (default) converts instantly and deterministically; "llm_markdown" is a slower LLM-cleaned conversion for pages where the default renders poorly.'
					},
					persist: {
						type: 'boolean',
						description: 'Store the markdown snapshot for reuse (default true).'
					},
					force_refresh: {
						type: 'boolean',
						description: 'Force a fresh fetch even if cached (default false).'
					},
					include_links: {
						type: 'boolean',
						description: 'Include a short list of outbound links when available.'
					},
					allow_redirects: {
						type: 'boolean',
						description: 'Follow redirects up to a fixed cap (default true).'
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
			description: `Hand a task off to a background agent ("Agent Run") that works autonomously and reports back into this conversation when done — without blocking the chat.
Use this when the user asks you to "go do X in the background", "have an agent handle X", "research/analyze X and get back to me", or for any self-contained task that is better run on its own than answered inline right now (e.g. "review this whole project and summarize the risks", "go through my projects and find stale tasks").
The tool returns immediately with { run_ids }; tell the user you've dispatched it and that you'll surface the result here. The agent's summary will be posted back into this thread automatically on completion — do not poll.
Prefer scope_mode "read_only" for analysis/summaries. Only use "read_write" when the user explicitly wants the agent to make changes. For a project task, pass context_type "project" + the project_id; otherwise use "global".
Do NOT use this for something you can answer directly in one turn.`,
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
						description:
							"'read_only' (analyze/summarize, default) or 'read_write' (may make changes — only when the user explicitly asks)."
					},
					max_tool_calls: {
						type: 'number',
						description:
							'Optional budget cap on the number of operations the agent may run.'
					},
					review: {
						type: 'boolean',
						description:
							'Set true to have a read_write agent STAGE its changes for review instead of committing directly. The run finishes as a proposal; you then present it and call commit_change_set once the user approves. Use when the blast radius warrants a check or the user says "let me review before you change anything". Ignored for read_only runs.'
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
			description: `Apply the staged changes a review agent proposed (its run is in status "proposal_ready"). Call this ONLY after presenting the proposal to the user and getting their approval. By default approves and applies every staged change; pass \`decisions\` to reject specific ones (or \`default_decision: "rejected"\` to reject all but the ones you approve). Returns how many changes applied/failed/were rejected.`,
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
						description:
							'Decision for changes not named in `decisions`. Defaults to "approved" (approve all).'
					}
				},
				required: ['run_id']
			}
		}
	}
];
