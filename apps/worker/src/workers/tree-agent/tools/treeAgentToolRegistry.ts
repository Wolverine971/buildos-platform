// apps/worker/src/workers/tree-agent/tools/treeAgentToolRegistry.ts

export type TreeAgentContextType = 'global' | 'project';

type TreeAgentToolContextScope = 'base' | 'global' | 'project';

type ToolMeta = {
	contexts: TreeAgentToolContextScope[];
	description: string;
};

// NOTE: Keep this list aligned with the worker-side tool executor.
export const TREE_AGENT_TOOL_METADATA: Record<string, ToolMeta> = {
	// Ontology read
	list_onto_projects: {
		contexts: ['global', 'project'],
		description: 'args: { state_key?, type_key?, limit? }'
	},
	search_onto_projects: {
		contexts: ['global', 'project'],
		description: 'args: { search: string, state_key?, type_key?, limit? }'
	},
	get_onto_project_details: {
		contexts: ['global', 'project'],
		description: 'args: { project_id: string }'
	},
	get_onto_project_graph: {
		contexts: ['project'],
		description: 'args: { project_id: string }'
	},
	list_onto_documents: {
		contexts: ['global', 'project'],
		description: 'args: { project_id?, type_key?, state_key?, limit? }'
	},
	search_onto_documents: {
		contexts: ['global', 'project'],
		description: 'args: { search: string, project_id?, type_key?, state_key?, limit? }'
	},
	get_onto_document_details: {
		contexts: ['global', 'project'],
		description: 'args: { document_id: string }'
	},
	list_onto_tasks: {
		contexts: ['global', 'project'],
		description: 'args: { project_id?, state_key?, limit? }'
	},
	search_onto_tasks: {
		contexts: ['global', 'project'],
		description: 'args: { search: string, project_id?, state_key?, limit? }'
	},
	get_onto_task_details: {
		contexts: ['global', 'project'],
		description: 'args: { task_id: string }'
	},
	list_onto_goals: {
		contexts: ['global', 'project'],
		description: 'args: { project_id?, state_key?, limit? }'
	},
	get_onto_goal_details: {
		contexts: ['global', 'project'],
		description: 'args: { goal_id: string }'
	},
	list_onto_plans: {
		contexts: ['global', 'project'],
		description: 'args: { project_id?, state_key?, limit? }'
	},
	get_onto_plan_details: {
		contexts: ['global', 'project'],
		description: 'args: { plan_id: string }'
	},
	list_onto_milestones: {
		contexts: ['global', 'project'],
		description: 'args: { project_id?, state_key?, limit? }'
	},
	get_onto_milestone_details: {
		contexts: ['global', 'project'],
		description: 'args: { milestone_id: string }'
	},
	list_onto_risks: {
		contexts: ['global', 'project'],
		description: 'args: { project_id?, state_key?, impact?, limit? }'
	},
	get_onto_risk_details: {
		contexts: ['global', 'project'],
		description: 'args: { risk_id: string }'
	},
	list_onto_requirements: {
		contexts: ['global', 'project'],
		description: 'args: { project_id?, type_key?, limit? }'
	},
	get_onto_requirement_details: {
		contexts: ['global', 'project'],
		description: 'args: { requirement_id: string }'
	},
	list_task_documents: {
		contexts: ['project'],
		description:
			'args: { task_id: string, limit? } // task workspace docs; avoid for plain task field updates'
	},
	get_entity_relationships: {
		contexts: ['base', 'global', 'project'],
		description: 'args: { entity_kind: string, entity_id: string, rel?, direction? }'
	},
	get_linked_entities: {
		contexts: ['base', 'global', 'project'],
		description:
			'args: { entity_kind: string, entity_id: string, rel?, direction?, entity_types?, limit? }'
	},
	search_ontology: {
		contexts: ['global', 'project'],
		description: 'args: { search: string, project_id?, entity_types?, limit? }'
	},

	// Ontology write
	create_onto_project: {
		contexts: ['global'],
		description: 'args: { name: string, description?, type_key?, state_key?, props? }'
	},
	update_onto_project: {
		contexts: ['global', 'project'],
		description: 'args: { project_id: string, name?, description?, state_key?, props? }'
	},
	create_onto_document: {
		contexts: ['global', 'project'],
		description:
			'args: { project_id?, title: string, content?, description?, type_key?, state_key?, props?, parent_document_id? }'
	},
	update_onto_document: {
		contexts: ['global', 'project'],
		description:
			'args: { document_id: string, title?, content?, description?, type_key?, state_key?, props? }'
	},
	create_onto_task: {
		contexts: ['global', 'project'],
		description:
			'args: { project_id?, title: string, description?, type_key?, state_key?, priority?, props? }'
	},
	update_onto_task: {
		contexts: ['global', 'project'],
		description:
			'args: { task_id: string, title?, description?, type_key?, state_key?, priority?, props? }'
	},
	create_onto_goal: {
		contexts: ['global', 'project'],
		description:
			'args: { project_id?, name: string, description?, state_key?, target_date?, props? }'
	},
	update_onto_goal: {
		contexts: ['global', 'project'],
		description:
			'args: { goal_id: string, name?, description?, state_key?, target_date?, props? }'
	},
	create_onto_plan: {
		contexts: ['global', 'project'],
		description:
			'args: { project_id?, name: string, description?, plan?, state_key?, type_key?, props? }'
	},
	update_onto_plan: {
		contexts: ['global', 'project'],
		description:
			'args: { plan_id: string, name?, description?, plan?, state_key?, type_key?, props? }'
	},
	create_onto_milestone: {
		contexts: ['global', 'project'],
		description:
			'args: { project_id?, title: string, description?, due_at?, state_key?, type_key?, props? }'
	},
	update_onto_milestone: {
		contexts: ['global', 'project'],
		description:
			'args: { milestone_id: string, title?, description?, due_at?, state_key?, type_key?, props? }'
	},
	create_onto_risk: {
		contexts: ['global', 'project'],
		description:
			'args: { project_id?, title: string, content?, impact?, probability?, state_key?, props? }'
	},
	update_onto_risk: {
		contexts: ['global', 'project'],
		description:
			'args: { risk_id: string, title?, content?, impact?, probability?, state_key?, props? }'
	},
	create_onto_requirement: {
		contexts: ['global', 'project'],
		description: 'args: { project_id?, text: string, type_key?, priority?, props? }'
	},
	update_onto_requirement: {
		contexts: ['global', 'project'],
		description: 'args: { requirement_id: string, text?, type_key?, priority?, props? }'
	},
	create_task_document: {
		contexts: ['project'],
		description:
			'args: { task_id: string, title?, content?, description?, type_key?, state_key?, role?, props?, document_id? }'
	},
	link_onto_entities: {
		contexts: ['project'],
		description:
			'args: { src_kind: string, src_id: string, dst_kind: string, dst_id: string, rel: string, props?, project_id? }'
	},
	unlink_onto_edge: {
		contexts: ['project'],
		description: 'args: { edge_id: string }'
	},

	// External
	web_search: {
		contexts: ['base', 'global', 'project'],
		description:
			'args: { query: string, search_depth?, max_results?, include_answer?, include_domains?, exclude_domains? }'
	},

	// Tree Agent tables
	list_tree_agent_runs: {
		contexts: ['base', 'global', 'project'],
		description: 'args: { status?, limit? }'
	},
	get_tree_agent_run: {
		contexts: ['base', 'global', 'project'],
		description: 'args: { run_id: string }'
	},
	list_tree_agent_nodes: {
		contexts: ['base', 'global', 'project'],
		description: 'args: { run_id: string, parent_node_id?, status?, depth?, limit? }'
	},
	get_tree_agent_node: {
		contexts: ['base', 'global', 'project'],
		description: 'args: { node_id: string }'
	},
	list_tree_agent_events: {
		contexts: ['base', 'global', 'project'],
		description: 'args: { run_id: string, since_seq?, limit? }'
	},
	get_tree_agent_artifacts: {
		contexts: ['base', 'global', 'project'],
		description: 'args: { run_id: string, node_id?, limit? }'
	},
	create_tree_agent_node: {
		contexts: ['base', 'global', 'project'],
		description:
			'args: { run_id: string, parent_node_id?, title: string, reason?, success_criteria?, band_index?, step_index?, depth?, status?, role_state?, context? }'
	},
	update_tree_agent_node: {
		contexts: ['base', 'global', 'project'],
		description:
			'args: { node_id: string, title?, reason?, success_criteria?, status?, role_state?, result?, context?, scratchpad_doc_id?, ended_at? }'
	},
	create_tree_agent_plan: {
		contexts: ['base', 'global', 'project'],
		description:
			'args: { run_id: string, node_id: string, version?: number, plan_json: object }'
	},
	create_tree_agent_artifact: {
		contexts: ['base', 'global', 'project'],
		description:
			'args: { run_id: string, node_id: string, artifact_type: string, label?, document_id?, json_payload?, is_primary? }'
	},
	insert_tree_agent_event: {
		contexts: ['base', 'global', 'project'],
		description:
			'args: { run_id: string, node_id: string, event_type: string, payload?: object, seq? }'
	}
};

export function isToolAllowedForContext(
	toolName: string,
	contextType: TreeAgentContextType
): boolean {
	const meta = TREE_AGENT_TOOL_METADATA[toolName];
	if (!meta) return false;
	return meta.contexts.includes('base') || meta.contexts.includes(contextType);
}

export function getDefaultToolNamesForContextType(contextType: TreeAgentContextType): string[] {
	return Object.entries(TREE_AGENT_TOOL_METADATA)
		.filter(([, meta]) => meta.contexts.includes('base') || meta.contexts.includes(contextType))
		.map(([name]) => name)
		.sort();
}

export function getToolGuideForContextType(
	contextType: TreeAgentContextType,
	toolNames?: string[]
): string {
	const names = (toolNames ?? getDefaultToolNamesForContextType(contextType)).filter((name) =>
		isToolAllowedForContext(name, contextType)
	);
	return names
		.map((name) => {
			const meta = TREE_AGENT_TOOL_METADATA[name];
			return meta ? `- ${name}: ${meta.description}` : `- ${name}`;
		})
		.join('\n');
}
