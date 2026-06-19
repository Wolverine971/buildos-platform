// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { buildToolPayloadForModel } from './tool-payload-compaction';

function toolCall(name: string): ChatToolCall {
	return {
		id: `call:${name}`,
		type: 'function',
		function: {
			name,
			arguments: '{}'
		}
	};
}

function toolResult(result: unknown): ChatToolResult {
	return {
		tool_call_id: 'call:test',
		success: true,
		result
	};
}

const parseArgs = () => ({ args: {} });

describe('buildToolPayloadForModel', () => {
	it('compacts ontology search results and strips internal fields', () => {
		const payload = buildToolPayloadForModel(
			toolCall('search_project'),
			toolResult({
				query: 'Rod Chamberlin',
				search_scope: 'project',
				project_id: 'project-1',
				total_returned: 2,
				total: 2,
				maybe_more: false,
				message: 'Found 2 matches.',
				search_vector: "'rod':1",
				results: [
					{
						type: 'document',
						id: 'doc-1',
						project_id: 'project-1',
						project_name: 'Tacemus',
						title: 'Rod Chamberlin',
						state_key: 'draft',
						type_key: 'document.default',
						score: 0.99,
						path: 'project:project-1/document:doc-1',
						snippet: 'Relevant meeting prep snippet',
						search_vector: "'internal':1",
						extra_large_field: 'x'.repeat(2000)
					}
				]
			}),
			parseArgs
		) as Record<string, any>;

		expect(JSON.stringify(payload)).not.toContain('search_vector');
		expect(payload.results).toEqual([
			expect.objectContaining({
				type: 'document',
				id: 'doc-1',
				title: 'Rod Chamberlin',
				snippet: 'Relevant meeting prep snippet'
			})
		]);
		expect(JSON.stringify(payload)).not.toContain('extra_large_field');
	});

	it('compacts document detail payloads to content previews', () => {
		const payload = buildToolPayloadForModel(
			toolCall('get_onto_document_details'),
			toolResult({
				message: 'Complete ontology document details loaded.',
				document: {
					id: 'doc-1',
					project_id: 'project-1',
					title: 'Rod Chamberlin Compliance Check-in Prep',
					description: 'Preparation notes',
					type_key: 'document.default',
					state_key: 'draft',
					content: `# Prep\n\n${'Approved compliance talking point. '.repeat(200)}`,
					props: {
						body_markdown: 'duplicate markdown body',
						search_vector: "'nested':1"
					},
					search_vector: "'internal':1"
				}
			}),
			parseArgs
		) as Record<string, any>;

		expect(JSON.stringify(payload)).not.toContain('search_vector');
		expect(JSON.stringify(payload)).not.toContain('duplicate markdown body');
		expect(payload.document).toEqual(
			expect.objectContaining({
				id: 'doc-1',
				title: 'Rod Chamberlin Compliance Check-in Prep',
				content_length: expect.any(Number),
				content_preview: expect.stringContaining('Approved compliance talking point')
			})
		);
	});

	it('compacts project detail payloads to counts and summaries', () => {
		const payload = buildToolPayloadForModel(
			toolCall('get_onto_project_details'),
			toolResult({
				message: 'Complete ontology project details loaded.',
				project: {
					id: 'project-1',
					name: 'Tacemus Website Design',
					description: 'Website design company',
					type_key: 'project.service.website',
					state_key: 'planning',
					task_count: 2,
					document_count: 1,
					search_vector: "'internal':1"
				},
				counts: {
					tasks: 4,
					requirements: 3,
					documents: 9
				},
				tasks: [
					{
						id: 'task-1',
						title: 'Follow up with Rod',
						description: 'Resolve compliance status',
						state_key: 'todo',
						search_vector: "'task':1"
					}
				],
				requirements: [
					{
						id: 'req-1',
						text: 'Compliance status must be resolved before launch.',
						type_key: 'requirement.compliance',
						search_vector: "'requirement':1"
					}
				],
				documents: [
					{
						id: 'doc-1',
						title: 'Rod notes',
						content: 'long document body'.repeat(500),
						props: { search_vector: "'doc':1" }
					}
				]
			}),
			parseArgs
		) as Record<string, any>;

		const serialized = JSON.stringify(payload);
		expect(serialized).not.toContain('search_vector');
		expect(serialized).not.toContain('long document bodylong document body');
		expect(payload.counts).toEqual(
			expect.objectContaining({ tasks: 4, requirements: 3, documents: 9 })
		);
		expect(payload.tasks).toEqual(expect.objectContaining({ total: 4, truncated: true }));
		expect(payload.tasks.items[0]).toEqual(
			expect.objectContaining({
				id: 'task-1',
				title: 'Follow up with Rod'
			})
		);
		expect(payload.requirements.items[0]).toEqual(
			expect.objectContaining({
				id: 'req-1',
				text: 'Compliance status must be resolved before launch.'
			})
		);
		expect(payload.documents.items[0]).toEqual(
			expect.objectContaining({
				id: 'doc-1',
				title: 'Rod notes',
				content_length: expect.any(Number)
			})
		);
	});

	it('preserves skill depth indexes and deliberate full-skill markdown', () => {
		const markdown = `# Cold Email Outreach\n\n${'Use the root skill first. '.repeat(180)}`;
		const payload = buildToolPayloadForModel(
			toolCall('skill_load'),
			toolResult({
				type: 'skill',
				id: 'cold_email_outreach',
				name: 'Cold Email Outreach',
				summary: 'Root cold outreach playbook.',
				parent_id: 'marketing',
				depth: 0,
				when_to_use: ['Plan a cold campaign.'],
				workflow: ['1) Choose mode.'],
				child_skills: [
					{
						id: 'cold_email_outreach.offer_crafting',
						summary: 'Deep offer-crafting playbook.',
						when_to_load: ['When the core offer needs design or repair.'],
						path: 'skills/cold_email_outreach/offer_crafting/SKILL.md'
					}
				],
				reference_modules: [
					{
						id: 'cold_email_outreach.source_map',
						summary: 'Source provenance and conflict resolution.',
						when_to_load: ['When source-level detail is needed.'],
						path: 'references/source-map.md',
						visibility: 'internal'
					}
				],
				markdown
			}),
			parseArgs
		) as Record<string, any>;

		expect(payload.parent_id).toBe('marketing');
		expect(payload.depth).toBe(0);
		expect(payload.child_skills[0]).toEqual(
			expect.objectContaining({
				id: 'cold_email_outreach.offer_crafting',
				path: 'skills/cold_email_outreach/offer_crafting/SKILL.md'
			})
		);
		expect(payload.reference_modules[0]).toEqual(
			expect.objectContaining({
				id: 'cold_email_outreach.source_map',
				visibility: 'internal'
			})
		);
		expect(payload.markdown.length).toBeGreaterThan(1200);
		expect(payload.markdown).toContain('Use the root skill first.');
	});

	it('preserves skill reference module content and metadata', () => {
		const content = `# Task State Coverage\n\n${'Include state_key when progress changed. '.repeat(120)}`;
		const payload = buildToolPayloadForModel(
			toolCall('skill_reference_load'),
			toolResult({
				type: 'skill_reference',
				skill_id: 'task_management',
				reference_id: 'task_management.state_coverage',
				name: 'Task State Coverage',
				summary: 'Extra task state mapping examples.',
				when_to_load: ['When progress language is ambiguous.'],
				path: 'references/state-coverage.md',
				content
			}),
			parseArgs
		) as Record<string, any>;

		expect(payload.type).toBe('skill_reference');
		expect(payload.skill_id).toBe('task_management');
		expect(payload.reference_id).toBe('task_management.state_coverage');
		expect(payload.path).toBe('references/state-coverage.md');
		expect(payload.content.length).toBeGreaterThan(1200);
		expect(payload.content).toContain('Include state_key when progress changed.');
	});

	it('preserves compact domain discovery metadata', () => {
		const payload = buildToolPayloadForModel(
			toolCall('domain_load'),
			toolResult({
				type: 'domain',
				domain_id: 'marketing.linkedin_company_page_growth',
				name: 'LinkedIn Company Page Growth',
				summary: 'Grow a LinkedIn Company Page.',
				coverage_status: 'strong',
				parent_ids: ['marketing'],
				child_domains: [],
				related_domain_ids: ['sales_and_growth'],
				boundaries: ['Company Pages, not primarily personal accounts.'],
				capability_ids: ['planning', 'web_research'],
				work_capability_ids: ['linkedin_company_page_growth_plan'],
				skills: [
					{
						id: 'linkedin_company_page_growth',
						use_when: 'Company Page growth work'
					}
				],
				recommended_skill_stacks: [
					{
						id: 'linkedin_growth_plan',
						name: 'LinkedIn Growth Plan',
						use_when: 'Planning a Page growth motion',
						skill_ids: ['linkedin_company_page_growth']
					}
				],
				resources: [],
				gaps: [],
				materialized_tools: [
					'work_capability_load',
					'outcome_card_load',
					'resource_search'
				],
				next_step: 'Load a linked skill only when needed.'
			}),
			parseArgs
		) as Record<string, any>;

		expect(payload).toMatchObject({
			type: 'domain',
			domain_id: 'marketing.linkedin_company_page_growth',
			coverage_status: 'strong'
		});
		expect(payload.skills[0]).toEqual(
			expect.objectContaining({ id: 'linkedin_company_page_growth' })
		);
		expect(payload.recommended_skill_stacks[0]).toEqual(
			expect.objectContaining({ id: 'linkedin_growth_plan' })
		);
		expect(payload.outcome_card_ids).toEqual(['linkedin_company_page_growth_plan']);
		expect(payload.materialized_tools).toEqual(['outcome_card_load', 'resource_search']);
		expect(payload.boundaries[0]).toContain('Company Pages');
	});

	it('preserves compact outcome card search metadata', () => {
		const payload = buildToolPayloadForModel(
			toolCall('outcome_card_search'),
			toolResult({
				type: 'outcome_card_search_results',
				query: 'youtube growth',
				filters: {
					domain: 'marketing.youtube_growth',
					buildos_capability: null
				},
				total_matches: 1,
				materialized_tools: ['outcome_card_load'],
				matches: [
					{
						outcome_card_id: 'youtube_growth_strategy_plan',
						name: 'YouTube Growth Strategy Plan',
						confidence: 0.91,
						summary: 'Plan channel positioning and content cadence.'.repeat(40),
						domain_ids: ['marketing.youtube_growth', 'creator_growth'],
						buildos_capability_ids: ['planning', 'documents'],
						default_skill_id: 'content_strategy_beyond_blogging',
						skill_ids: [
							'content_strategy_beyond_blogging',
							'algorithm_aware_publishing',
							'viral_video_script_structure'
						],
						coverage_status: 'partial',
						load_hint: 'Load this outcome card.'
					}
				],
				next_step: 'Pick the closest outcome.'
			}),
			parseArgs
		) as Record<string, any>;

		expect(payload).toMatchObject({
			type: 'outcome_card_search_results',
			query: 'youtube growth',
			materialized_tools: ['outcome_card_load']
		});
		expect(payload.matches[0]).toEqual(
			expect.objectContaining({
				outcome_card_id: 'youtube_growth_strategy_plan',
				default_skill_id: 'content_strategy_beyond_blogging'
			})
		);
		expect(payload.matches[0].summary.length).toBeLessThan(360);
	});

	it('preserves compact outcome card metadata', () => {
		const payload = buildToolPayloadForModel(
			toolCall('outcome_card_load'),
			toolResult({
				type: 'outcome_card',
				id: 'cold_email_campaign_build',
				name: 'Cold Email Campaign Build',
				summary: 'Build a cold email campaign.',
				domain_ids: ['sales_and_growth.cold_email'],
				buildos_capability_ids: ['planning', 'people_context', 'documents'],
				when_to_use: ['When the user needs a campaign build.'],
				example_requests: ['Build a campaign for founders.'],
				default_skill_id: 'cold_email_engagement_first_outreach',
				skill_ids: ['cold_email_engagement_first_outreach', 'cold_email_icp_signal_design'],
				resource_ids: [],
				tool_hints: ['create_onto_document'],
				outputs: ['ICP and signal definition', 'campaign copy'],
				evaluation_criteria: ['The outreach is specific.'],
				coverage_status: 'strong',
				gaps: [],
				materialized_tools: ['skill_load'],
				next_step: 'Load the root skill only when needed.',
				extra_large_field: 'x'.repeat(2000)
			}),
			parseArgs
		) as Record<string, any>;

		expect(payload).toMatchObject({
			type: 'outcome_card',
			id: 'cold_email_campaign_build',
			materialized_tools: ['skill_load']
		});
		expect(payload.tool_hints).toEqual(['create_onto_document']);
		expect(JSON.stringify(payload)).not.toContain('extra_large_field');
	});

	it('preserves compact skill search metadata', () => {
		const payload = buildToolPayloadForModel(
			toolCall('skill_search'),
			toolResult({
				type: 'skill_search_results',
				query: 'video script',
				filters: {
					domain: 'marketing.youtube_growth'
				},
				total_matches: 1,
				matches: [
					{
						skill_id: 'viral_video_script_structure',
						name: 'Viral Video Script Structure',
						parent_id: 'content_strategy_beyond_blogging',
						depth: 1,
						confidence: 0.82,
						summary: 'Write or audit video scripts.'.repeat(40),
						when_to_use: ['When scripting videos.'],
						related_ops: [],
						load_hint: 'Load only when this child skill is the specific needed lens.'
					}
				],
				next_step: 'Pick the most relevant root skill by default.'
			}),
			parseArgs
		) as Record<string, any>;

		expect(payload).toMatchObject({
			type: 'skill_search_results',
			query: 'video script'
		});
		expect(payload.matches[0]).toEqual(
			expect.objectContaining({
				skill_id: 'viral_video_script_structure',
				parent_id: 'content_strategy_beyond_blogging'
			})
		);
		expect(payload.matches[0].summary.length).toBeLessThan(320);
	});

	it('preserves compact resource search metadata', () => {
		const payload = buildToolPayloadForModel(
			toolCall('resource_search'),
			toolResult({
				type: 'resource_search_results',
				query: 'source map',
				filters: {
					domain: 'product_and_design.ui_ux_quality'
				},
				total_matches: 1,
				materialized_tools: ['resource_load'],
				matches: [
					{
						resource_id: 'build_quality_ui_ux.source_map',
						kind: 'skill_reference',
						title: 'UI/UX Source Map',
						confidence: 0.72,
						summary: 'Source inventory and provenance.'.repeat(40),
						when_to_load: ['When checking source provenance.'],
						domain_ids: ['product_and_design.ui_ux_quality'],
						skill_ids: ['build_quality_ui_ux'],
						skill_id: 'build_quality_ui_ux',
						path: 'references/source-map.md',
						visibility: 'internal'
					}
				],
				next_step: 'Load only when source detail would change the answer.'
			}),
			parseArgs
		) as Record<string, any>;

		expect(payload).toMatchObject({
			type: 'resource_search_results',
			query: 'source map',
			materialized_tools: ['resource_load']
		});
		expect(payload.matches[0]).toEqual(
			expect.objectContaining({
				resource_id: 'build_quality_ui_ux.source_map',
				kind: 'skill_reference',
				skill_id: 'build_quality_ui_ux',
				visibility: 'internal'
			})
		);
		expect(payload.matches[0].summary.length).toBeLessThan(320);
	});

	it('preserves compact domain resource metadata', () => {
		const payload = buildToolPayloadForModel(
			toolCall('resource_load'),
			toolResult({
				type: 'resource',
				resource_id: 'youtube_library.marketing_and_content_combo_index',
				kind: 'domain_resource',
				title: 'Marketing and Content Skill Combo Index',
				summary: 'Internal source map for marketing/content skill coverage.',
				when_to_load: ['When expanding the marketing/content skill family.'],
				domain_ids: ['marketing.content_strategy'],
				skill_ids: ['content_strategy_beyond_blogging'],
				message:
					'This resource is indexed for routing, but no bundled content loader is registered yet.',
				extra_large_field: 'x'.repeat(2000)
			}),
			parseArgs
		) as Record<string, any>;

		expect(payload).toMatchObject({
			type: 'resource',
			resource_id: 'youtube_library.marketing_and_content_combo_index',
			kind: 'domain_resource'
		});
		expect(payload.message).toContain('indexed for routing');
		expect(JSON.stringify(payload)).not.toContain('extra_large_field');
	});
});
