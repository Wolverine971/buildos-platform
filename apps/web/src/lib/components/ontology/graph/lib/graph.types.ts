// apps/web/src/lib/components/ontology/graph/lib/graph.types.ts
import type { Database } from '@buildos/shared-types';

// Cytoscape is runtime-loaded; keep loose typing until dedicated types are added.
export type CytoscapeCore = any;

export type OntoTemplate = Database['public']['Tables']['onto_templates']['Row'];
export type OntoProject = Database['public']['Tables']['onto_projects']['Row'];
export type OntoEdge = Database['public']['Tables']['onto_edges']['Row'];
export type OntoTask = Database['public']['Tables']['onto_tasks']['Row'];
export type OntoOutput = Database['public']['Tables']['onto_outputs']['Row'];
export type OntoDocument = Database['public']['Tables']['onto_documents']['Row'];

export type ViewMode = 'templates' | 'projects' | 'full';

export interface GraphNode {
	id: string;
	label: string;
	type: 'template' | 'project' | 'task' | 'output' | 'document';
	connectedEdges?: number;
	neighbors?: number;
	metadata?: Record<string, unknown>;
}

export interface CytoscapeNode {
	data: {
		id: string;
		label: string;
		type: 'template' | 'project' | 'task' | 'output' | 'document';
		parent?: string;
		metadata: Record<string, unknown>;
		color: string;
		size: number;
		shape: string;
	};
}

export interface CytoscapeEdge {
	data: {
		id: string;
		source: string;
		target: string;
		label: string;
		relationship: string;
		strength?: number;
	};
}

export interface GraphData {
	nodes: CytoscapeNode[];
	edges: CytoscapeEdge[];
}

export interface GraphSourceData {
	templates: OntoTemplate[];
	projects: OntoProject[];
	edges: OntoEdge[];
	tasks: OntoTask[];
	outputs: OntoOutput[];
	documents: OntoDocument[];
}

export interface GraphStats {
	totalTemplates: number;
	totalProjects: number;
	activeProjects: number;
	totalEdges: number;
	totalTasks: number;
	totalOutputs: number;
	totalDocuments: number;
}

export interface OntologyGraphInstance {
	cy: CytoscapeCore;
	changeLayout: (layoutName: string) => void;
	fitToView: () => void;
	centerOnNode: (nodeId: string) => void;
	filterByType: (type: string) => void;
	resetFilters: () => void;
	search: (query: string) => void;
}
