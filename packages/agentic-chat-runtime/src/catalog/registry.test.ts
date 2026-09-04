// packages/agentic-chat-runtime/src/catalog/registry.test.ts
import { describe, expect, it } from 'vitest';
import { AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY, CHAT_TOOL_DEFINITIONS } from './definitions';
import { TOOL_METADATA } from './metadata';
import { TOOL_OPERATIONS, buildToolRegistry, getToolDiscoveryPolicyVersion } from './registry';

/**
 * The op name space exactly as production served it on 2026-09-04, before
 * `TOOL_OPERATIONS` replaced the four derivation maps. Gateway op names are the
 * external contract for MCP and agent-call, so this list is a contract fixture:
 * a row may be added when a tool is added, but an existing op name may not move
 * without a deliberate external-contract change.
 */
const FROZEN_TOOL_OPERATION_ROWS_2026_09_04: readonly string[] = Object.freeze([
	'call_corsair_mcp_tool util.corsair_mcp.tool.call write',
	'commit_change_set util.agent.commit_changes write',
	'create_calendar_event cal.event.create write',
	'create_onto_document onto.document.create write',
	'create_onto_goal onto.goal.create write',
	'create_onto_milestone onto.milestone.create write',
	'create_onto_plan onto.plan.create write',
	'create_onto_project onto.project.create write',
	'create_onto_risk onto.risk.create write',
	'create_onto_task onto.task.create write',
	'create_task_document onto.task.docs.create_or_attach write',
	'delegate_task util.agent.delegate write',
	'delete_calendar_event cal.event.delete write',
	'delete_onto_document onto.document.delete write',
	'delete_onto_goal onto.goal.delete write',
	'delete_onto_milestone onto.milestone.delete write',
	'delete_onto_plan onto.plan.delete write',
	'delete_onto_project onto.project.delete write',
	'delete_onto_risk onto.risk.delete write',
	'delete_onto_task onto.task.delete write',
	'explore_project x.search.explore read',
	'get_buildos_overview util.buildos.overview read',
	'get_buildos_usage_guide util.buildos.usage_guide read',
	'get_calendar_event_details cal.event.get read',
	'get_document_outline onto.document_outline.get read',
	'get_document_path onto.document.path.get read',
	'get_document_tree onto.document.tree.get read',
	'get_email_message email.messages.get read',
	'get_entity_relationships onto.entity.relationships.get read',
	'get_external_account_status email.accounts.status read',
	'get_field_info util.schema.field_info read',
	'get_linked_entities onto.entity.links.get read',
	'get_onto_document_details onto.document.get read',
	'get_onto_goal_details onto.goal.get read',
	'get_onto_milestone_details onto.milestone.get read',
	'get_onto_plan_details onto.plan.get read',
	'get_onto_project_details onto.project.get read',
	'get_onto_project_graph onto.project.graph.get read',
	'get_onto_risk_details onto.risk.get read',
	'get_onto_task_details onto.task.get read',
	'get_project_calendar cal.project.get read',
	'get_project_overview util.project.overview read',
	'get_user_profile_overview util.profile.overview read',
	'get_workspace_overview util.workspace.overview read',
	'link_onto_entities onto.edge.link write',
	'link_user_contact util.contact.link write',
	'list_calendar_events cal.event.list read',
	'list_corsair_mcp_tools util.corsair_mcp.tools.list read',
	'list_email_accounts email.accounts.list read',
	'list_onto_documents onto.document.list read',
	'list_onto_goals onto.goal.list read',
	'list_onto_milestones onto.milestone.list read',
	'list_onto_plans onto.plan.list read',
	'list_onto_projects onto.project.list read',
	'list_onto_risks onto.risk.list read',
	'list_onto_tasks onto.task.list read',
	'list_task_documents onto.task.docs.list read',
	'list_user_contact_candidates util.contact.candidates.list read',
	'move_document_in_tree onto.document.tree.move write',
	'move_onto_task onto.task.move write',
	'read_document_section x.misc.read_document_section read',
	'reorganize_onto_project_graph onto.project.graph.reorganize write',
	'request_email_account_connection email.accounts.connect write',
	'resolve_user_contact_candidate util.contact.candidate.resolve write',
	'search_all_projects x.search.all_projects read',
	'search_email_messages email.messages.search read',
	'search_onto_documents onto.document.search read',
	'search_onto_goals onto.goal.search read',
	'search_onto_milestones onto.milestone.search read',
	'search_onto_plans onto.plan.search read',
	'search_onto_projects onto.project.search read',
	'search_onto_risks onto.risk.search read',
	'search_onto_tasks onto.task.search read',
	'search_ontology onto.search read',
	'search_project x.search.project read',
	'search_user_contacts util.contact.search read',
	'set_project_calendar cal.project.set write',
	'tag_onto_entity x.misc.tag_onto_entity write',
	'unlink_onto_edge onto.edge.unlink write',
	'update_calendar_event cal.event.update write',
	'update_onto_document onto.document.update write',
	'update_onto_goal onto.goal.update write',
	'update_onto_milestone onto.milestone.update write',
	'update_onto_plan onto.plan.update write',
	'update_onto_project onto.project.update write',
	'update_onto_risk onto.risk.update write',
	'update_onto_task onto.task.update write',
	'upsert_user_contact util.contact.upsert write',
	'web_search util.web.search read',
	'web_visit util.web.visit read'
]);

describe('catalog registry versioning', () => {
	it('keeps discovery policy out of the stable registry schema version', () => {
		const visibleMetadata = {
			...TOOL_METADATA,
			search_onto_goals: {
				...TOOL_METADATA.search_onto_goals,
				chatDiscovery: 'visible' as const
			}
		};
		const hiddenMetadata = {
			...TOOL_METADATA,
			search_onto_goals: {
				...TOOL_METADATA.search_onto_goals,
				chatDiscovery: 'hidden' as const
			}
		};

		expect(buildToolRegistry(CHAT_TOOL_DEFINITIONS, hiddenMetadata).version).toBe(
			buildToolRegistry(CHAT_TOOL_DEFINITIONS, visibleMetadata).version
		);
		expect(getToolDiscoveryPolicyVersion(CHAT_TOOL_DEFINITIONS, hiddenMetadata)).not.toBe(
			getToolDiscoveryPolicyVersion(CHAT_TOOL_DEFINITIONS, visibleMetadata)
		);
	});

	it('preserves the reviewed op taxonomy and discovery flags', () => {
		const registry = buildToolRegistry(CHAT_TOOL_DEFINITIONS, TOOL_METADATA);

		expect(registry.ops['onto.task.move']).toMatchObject({
			tool_name: 'move_onto_task',
			group: 'onto',
			entity: 'task',
			kind: 'write',
			chat_discoverable: true
		});
		expect(registry.byToolName.search_onto_goals).toMatchObject({
			op: 'onto.goal.search',
			chat_discoverable: false
		});
	});

	it('binds every catalog tool to exactly one op, and every op to one live tool', () => {
		const catalogNames = CHAT_TOOL_DEFINITIONS.map((tool) => tool.function.name);
		const tableNames = Object.keys(TOOL_OPERATIONS);

		// Complete: every catalog tool has a row.
		expect([...tableNames].sort()).toEqual([...catalogNames].sort());
		// Unambiguous: no tool name is listed twice, no op is claimed twice.
		expect(new Set(catalogNames).size).toBe(catalogNames.length);
		const ops = tableNames.map((name) => TOOL_OPERATIONS[name]!.op);
		expect(new Set(ops).size).toBe(ops.length);
		for (const op of ops) expect(op.trim()).toBe(op);
	});

	it('keeps the production op name space unchanged', () => {
		const registry = buildToolRegistry(CHAT_TOOL_DEFINITIONS, TOOL_METADATA);
		const rows = Object.values(registry.byToolName)
			.map((entry) => `${entry.tool_name} ${entry.op} ${entry.kind}`)
			.sort();

		expect(rows).toEqual([...FROZEN_TOOL_OPERATION_ROWS_2026_09_04]);
		// The table is the only source: reading it directly must give the same map.
		expect(
			Object.entries(TOOL_OPERATIONS)
				.map(([name, operation]) => `${name} ${operation.op} ${operation.kind}`)
				.sort()
		).toEqual([...FROZEN_TOOL_OPERATION_ROWS_2026_09_04]);
	});

	it('leaves discovery and control tools out of the op name space', () => {
		const directNames = new Set(CHAT_TOOL_DEFINITIONS.map((tool) => tool.function.name));
		const nonDirectNames = AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY.map(
			(tool) => tool.function.name
		).filter((name) => !directNames.has(name));

		expect(nonDirectNames.length).toBeGreaterThan(0);
		for (const name of nonDirectNames) {
			expect(TOOL_OPERATIONS[name], `${name} must carry no gateway op`).toBeUndefined();
		}
	});

	it('rejects an unknown tool name instead of inventing an op for it', () => {
		expect(() =>
			buildToolRegistry(
				[
					{
						type: 'function',
						function: {
							name: 'get_invented_thing',
							description: '',
							parameters: { type: 'object', properties: {} }
						}
					}
				],
				TOOL_METADATA
			)
		).toThrow(/get_invented_thing/);
	});
});
