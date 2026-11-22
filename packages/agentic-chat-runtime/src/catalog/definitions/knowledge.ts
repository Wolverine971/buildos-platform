// packages/agentic-chat-runtime/src/catalog/definitions/knowledge.ts
//
// Personal knowledge graph tools (tasker 160): people, organizations, websites, channels,
// videos, places and topics the user knows about, with cited facts. Same five tools in chat
// and over the remote MCP connector (ops knowledge.*). The graph is the user's own, never a
// project, so no tool takes a project_id.
//
// The catalog stays import-free, so the vocabulary is mirrored here as literals; the
// definitions test pins both lists to `@buildos/shared-agent-ops/knowledge`. Enums carry the
// vocabulary so models see it without a separate describe tool.
import type { ChatToolDefinition, ToolJsonSchema } from '@buildos/shared-types';

export const KNOWLEDGE_TOOL_KINDS = [
	'person',
	'org',
	'website',
	'channel',
	'video',
	'place',
	'topic',
	'product',
	'event'
] as const;

/** Every predicate key, in vocabulary order. */
export const KNOWLEDGE_TOOL_PREDICATES = [
	'alias',
	'description',
	'headline',
	'url',
	'homepage',
	'profile_url',
	'email',
	'phone',
	'address',
	'birthday',
	'note',
	'works_at',
	'educated_at',
	'knows',
	'connected_on',
	'part_of',
	'located_in',
	'owns',
	'published_by',
	'features',
	'about',
	'industry',
	'founded',
	'published_at',
	'duration_seconds',
	'thumbnail_url',
	'related_to'
] as const;

/** Predicates whose object is another entity (the ones query_knowledge can follow). */
export const KNOWLEDGE_TOOL_RELATIONSHIP_PREDICATES = [
	'works_at',
	'educated_at',
	'knows',
	'part_of',
	'located_in',
	'owns',
	'published_by',
	'features',
	'about',
	'related_to'
] as const;

export const KNOWLEDGE_TOOL_SOURCE_TYPES = [
	'web',
	'youtube',
	'user',
	'chat',
	'document',
	'agent'
] as const;

export const KNOWLEDGE_TOOL_KEY_TYPES = [
	'domain',
	'url',
	'youtube_video',
	'youtube_channel',
	'linkedin',
	'email',
	'phone',
	'external'
] as const;

const KINDS: ToolJsonSchema = {
	type: 'array',
	items: { type: 'string', enum: [...KNOWLEDGE_TOOL_KINDS] }
};

const ENTITY_ID: ToolJsonSchema = { type: 'string', format: 'uuid' };

/** query_knowledge's people filters (tasker 166); pinned to shared-agent-ops by the test. */
export const KNOWLEDGE_TOOL_GROUP_BY = ['company', 'place', 'region', 'industry', 'title'] as const;
export const KNOWLEDGE_TOOL_EMPLOYMENT = ['current', 'former', 'any'] as const;
export const KNOWLEDGE_TOOL_PLACE_OF = ['any', 'person', 'company'] as const;
export const KNOWLEDGE_TOOL_RECORD_KINDS = ['task', 'document', 'project'] as const;

const WORDS: ToolJsonSchema = { type: 'array', maxItems: 12, items: { type: 'string' } };

export const KNOWLEDGE_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'search_knowledge',
			description:
				"Find people, organizations, websites, channels, videos, places and topics in the user's personal knowledge graph (their contacts, research and anything recorded before). Use before answering who someone is, who the user knows somewhere, or what is known about a company or video.",
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					query: { type: 'string', description: 'Name, handle, email, domain or URL.' },
					kinds: KINDS,
					limit: { type: 'integer', minimum: 1, maximum: 25, default: 10 }
				},
				required: ['query']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_knowledge_entity',
			description:
				'Read one knowledge entry: facts with sources, relationships pointing at it, linked BuildOS records, and whether the user knows them.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: { entity_id: ENTITY_ID },
				required: ['entity_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'query_knowledge',
			description:
				"List entries by following relationships. direction out: subject→object (Sam works_at→Palantir); in: the reverse. People at Palantir: start {search:'Palantir', kinds:['org']}, follow [{predicate:'works_at', direction:'in', kinds:['person']}]; where {known_by_me:true} keeps people the user knows. fields adds those values per row; coverage counts gaps. People filters (no follow): start {known_by_me:true}, where {company, title, industry, place…} lists matching people with employer, title, place and contact details; group_by counts them per company, place or industry (where {place:['Maryland'], place_of:'company', industry:['software']}, group_by 'company'). Relay notes about missing data; never guess.",
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					start: {
						type: 'object',
						additionalProperties: false,
						description: 'One of: entity_ids, search, kinds, known_by_me, owned_by_me.',
						properties: {
							entity_ids: { type: 'array', items: ENTITY_ID, maxItems: 50 },
							search: { type: 'string' },
							kinds: KINDS,
							known_by_me: { type: 'boolean' },
							owned_by_me: { type: 'boolean' }
						}
					},
					follow: {
						type: 'array',
						maxItems: 2,
						items: {
							type: 'object',
							additionalProperties: false,
							properties: {
								predicate: {
									type: 'string',
									enum: [...KNOWLEDGE_TOOL_RELATIONSHIP_PREDICATES]
								},
								direction: { type: 'string', enum: ['out', 'in'], default: 'out' },
								kinds: KINDS
							},
							required: ['predicate']
						}
					},
					where: {
						type: 'object',
						additionalProperties: false,
						properties: {
							known_by_me: { type: 'boolean' },
							owned_by_me: { type: 'boolean' },
							company: { ...WORDS, description: 'Employer names.' },
							employment: {
								type: 'string',
								enum: [...KNOWLEDGE_TOOL_EMPLOYMENT],
								description: 'former: used to work there.'
							},
							title: { ...WORDS, description: 'Title words: engineer.' },
							industry: WORDS,
							place: { ...WORDS, description: 'City, state or country names.' },
							place_of: { type: 'string', enum: [...KNOWLEDGE_TOOL_PLACE_OF] },
							in_records: {
								type: 'array',
								items: { type: 'string', enum: [...KNOWLEDGE_TOOL_RECORD_KINDS] }
							},
							via: { type: 'string', description: 'e.g. linkedin' },
							related_to: {
								...ENTITY_ID,
								description: 'Person: shares their employer or place.'
							},
							bridge_to: {
								...WORDS,
								description: 'Company names: people who lead to someone there.'
							}
						}
					},
					group_by: { type: 'string', enum: [...KNOWLEDGE_TOOL_GROUP_BY] },
					fields: {
						type: 'array',
						maxItems: 12,
						items: { type: 'string', enum: [...KNOWLEDGE_TOOL_PREDICATES] }
					},
					limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
				},
				required: ['start']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'record_knowledge',
			description:
				'Save entities and facts the user stated or that you found with a source. Every fact you found on the web must cite a source with a url and a short exact quote. Never invent values; leave unknowns out. Everything recorded is private to the user. Reuse existing entries by id; self:true is the user (the user knows Sam: subject self, predicate knows).',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					entities: {
						type: 'array',
						maxItems: 50,
						items: {
							type: 'object',
							additionalProperties: false,
							properties: {
								ref: {
									type: 'string',
									description: 'Handle facts use, e.g. "sam".'
								},
								id: ENTITY_ID,
								self: { type: 'boolean' },
								kind: { type: 'string', enum: [...KNOWLEDGE_TOOL_KINDS] },
								name: { type: 'string' },
								summary: { type: 'string' },
								keys: {
									type: 'array',
									maxItems: 10,
									items: {
										type: 'object',
										additionalProperties: false,
										properties: {
											type: {
												type: 'string',
												enum: [...KNOWLEDGE_TOOL_KEY_TYPES]
											},
											value: { type: 'string' }
										},
										required: ['type', 'value']
									}
								}
							},
							required: ['ref', 'kind', 'name']
						}
					},
					facts: {
						type: 'array',
						maxItems: 200,
						items: {
							type: 'object',
							additionalProperties: false,
							properties: {
								subject: { type: 'string', description: 'Entity ref or id.' },
								predicate: { type: 'string', enum: [...KNOWLEDGE_TOOL_PREDICATES] },
								object: {
									type: 'string',
									description: 'Relationship target: ref or id.'
								},
								value: {
									type: ['string', 'number'],
									description: 'Property value.'
								},
								qualifiers: {
									type: 'object',
									description:
										'e.g. works_at {title,start,end,current}; knows {via,since}.'
								},
								valid_from: { type: 'string' },
								valid_to: { type: 'string' },
								sources: { type: 'array', maxItems: 10, items: { type: 'string' } },
								quote: {
									type: 'string',
									description: 'Exact words from the source.'
								}
							},
							required: ['subject', 'predicate']
						}
					},
					sources: {
						type: 'array',
						maxItems: 20,
						items: {
							type: 'object',
							additionalProperties: false,
							properties: {
								ref: { type: 'string' },
								type: { type: 'string', enum: [...KNOWLEDGE_TOOL_SOURCE_TYPES] },
								url: { type: 'string' },
								title: { type: 'string' }
							},
							required: ['ref', 'type']
						}
					}
				},
				required: ['entities', 'facts']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'enrich_knowledge',
			description:
				'Web research on entries, saved with sources (paid, capped per day). Use when the user asks to find more about someone or something. Returns what it searched and saved, or that it is still running. Call it alone.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					entity_ids: { type: 'array', minItems: 1, maxItems: 10, items: ENTITY_ID },
					fields: {
						type: 'array',
						maxItems: 12,
						items: { type: 'string' },
						description: 'Predicate keys to look for; default by kind.'
					},
					instructions: { type: 'string', maxLength: 500 }
				},
				required: ['entity_ids']
			}
		}
	},
	// Knowledge in shared projects (tasker 168): other members' entries, never the user's.
	{
		type: 'function',
		function: {
			name: 'get_project_knowledge_lens',
			description:
				'What OTHER members of a shared project know about the people and orgs named in its tasks or documents (who does everyone on this project know). Every fact has shared_by and scope: say "DJ\'s People say…"; never present it as the user\'s own knowledge or save it with record_knowledge. hidden counts details the owner has not shared.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					project_id: { type: 'string', format: 'uuid' },
					record_kind: {
						type: 'string',
						enum: ['task', 'document'],
						description: 'Omit for both.'
					},
					record_ids: {
						type: 'array',
						maxItems: 100,
						items: { type: 'string', format: 'uuid' },
						description: 'Specific tasks or documents; omit for the 100 most recent.'
					}
				},
				required: ['project_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'request_knowledge_access',
			description:
				"Ask the member who holds an entry (from get_project_knowledge_lens, can_ask true) to share its hidden details with the user. Only when the user asks for it. Goes out in the user's name; nothing is shared until the owner chooses in BuildOS. You cannot approve.",
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					entity_id: ENTITY_ID,
					project_id: { type: 'string', format: 'uuid' },
					what: { type: 'string', enum: ['contact', 'all'], default: 'contact' }
				},
				required: ['entity_id', 'project_id']
			}
		}
	}
];
