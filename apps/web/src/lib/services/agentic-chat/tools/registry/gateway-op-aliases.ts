// apps/web/src/lib/services/agentic-chat/tools/registry/gateway-op-aliases.ts
/**
 * Legacy gateway op aliases.
 *
 * Maps historical op names to canonical gateway op names used by the
 * current tool registry.
 */

export const GATEWAY_OP_ALIASES: Record<string, string> = {
	onto_projects_get_document_tree: 'onto.document.tree.get',
	onto_projects_move_document_in_tree: 'onto.document.tree.move',
	onto_projects_get_document_path: 'onto.document.path.get',
	onto_projects_get_onto_project_graph: 'onto.project.graph.get',
	onto_projects_reorganize_onto_project_graph: 'onto.project.graph.reorganize',
	onto_projects_link_onto_entities: 'onto.edge.link',
	onto_projects_unlink_onto_edge: 'onto.edge.unlink',
	onto_projects_search_ontology: 'onto.search',
	'onto_projects.get_document_tree': 'onto.document.tree.get',
	'onto_projects.move_document_in_tree': 'onto.document.tree.move',
	'onto_projects.get_document_path': 'onto.document.path.get',
	'onto_projects.get_onto_project_graph': 'onto.project.graph.get',
	'onto_projects.reorganize_onto_project_graph': 'onto.project.graph.reorganize',
	'onto_projects.link_onto_entities': 'onto.edge.link',
	'onto_projects.unlink_onto_edge': 'onto.edge.unlink',
	'onto_projects.search_ontology': 'onto.search',
	'onto_projects.doc_structure.tree.get': 'onto.document.tree.get',
	'onto_projects.doc_structure.tree.move': 'onto.document.tree.move',
	'onto_projects.doc_structure.path.get': 'onto.document.path.get'
};

const GATEWAY_HELP_PATH_ALIASES: Record<string, string> = {
	'onto_projects.doc_structure': 'onto.document.tree',
	'onto_projects.doc_structure.tree': 'onto.document.tree',
	'onto_projects.doc_structure.path': 'onto.document.path'
};

export function normalizeGatewayOpName(op: string): string {
	const trimmed = op.trim();
	if (!trimmed) return '';
	return GATEWAY_OP_ALIASES[trimmed] ?? trimmed;
}

export function normalizeGatewayHelpPath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) return '';
	const alias = GATEWAY_HELP_PATH_ALIASES[trimmed];
	if (alias) return alias;
	return normalizeGatewayOpName(trimmed);
}
