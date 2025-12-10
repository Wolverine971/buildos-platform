// apps/web/src/lib/components/ontology/graph/lib/graph.types.ts
import type { Database } from '@buildos/shared-types';

// Cytoscape is runtime-loaded; keep loose typing until dedicated types are added.
export type CytoscapeCore = any;

// Database row types for all ontology entities
export type OntoTemplate = Database['public']['Tables']['onto_templates']['Row'];
export type OntoProject = Database['public']['Tables']['onto_projects']['Row'];
export type OntoEdge = Database['public']['Tables']['onto_edges']['Row'];
export type OntoTask = Database['public']['Tables']['onto_tasks']['Row'];
export type OntoOutput = Database['public']['Tables']['onto_outputs']['Row'];
export type OntoDocument = Database['public']['Tables']['onto_documents']['Row'];
export type OntoPlan = Database['public']['Tables']['onto_plans']['Row'];
export type OntoGoal = Database['public']['Tables']['onto_goals']['Row'];
export type OntoMilestone = Database['public']['Tables']['onto_milestones']['Row'];

export type ViewMode = 'templates' | 'projects' | 'full';

// All supported node types in the graph
export type NodeType =
	| 'template'
	| 'project'
	| 'task'
	| 'output'
	| 'document'
	| 'plan'
	| 'goal'
	| 'milestone';

export interface GraphNode {
	id: string;
	label: string;
	type: NodeType;
	connectedEdges?: number;
	neighbors?: number;
	metadata?: Record<string, unknown>;
}

export interface CytoscapeNode {
	data: {
		id: string;
		label: string;
		type: NodeType;
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
		color?: string;
		width?: number;
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
	plans: OntoPlan[];
	goals: OntoGoal[];
	milestones: OntoMilestone[];
}

export interface GraphStats {
	totalTemplates: number;
	totalProjects: number;
	activeProjects: number;
	totalEdges: number;
	totalTasks: number;
	totalOutputs: number;
	totalDocuments: number;
	totalPlans: number;
	totalGoals: number;
	totalMilestones: number;
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
