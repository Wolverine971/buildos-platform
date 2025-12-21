// apps/web/src/lib/components/ontology/graph/lib/graph.types.ts
/**
 * Graph visualization types for ontology entities.
 *
 * Uses types from onto-api.ts which match the actual API response shapes
 * from project-graph-loader.ts, rather than raw Database row types.
 */
import type {
	OntoProject,
	OntoEdge,
	OntoTask,
	OntoOutput,
	OntoDocument,
	OntoPlan,
	OntoGoal,
	OntoMilestone,
	OntoRisk,
	OntoDecision
} from '$lib/types/onto-api';

// Re-export for convenience
export type {
	OntoProject,
	OntoEdge,
	OntoTask,
	OntoOutput,
	OntoDocument,
	OntoPlan,
	OntoGoal,
	OntoMilestone,
	OntoRisk,
	OntoDecision
};

// Cytoscape is runtime-loaded; keep loose typing until dedicated types are added.
export type CytoscapeCore = any;

export type ViewMode = 'projects' | 'full';

// All supported node types in the graph
export type NodeType =
	| 'project'
	| 'task'
	| 'output'
	| 'document'
	| 'plan'
	| 'goal'
	| 'milestone'
	| 'risk'
	| 'decision';

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
		state?: string;
		primitive?: string; // For outputs
		parent?: string;
		metadata: Record<string, unknown>;
		// Visual properties
		color: string;
		borderColor?: string;
		borderWidth?: number;
		borderStyle?: 'solid' | 'dashed' | 'dotted';
		width?: number;
		height?: number;
		size: number;
		shape: string;
		fontSize?: number;
		fontWeight?: number;
		labelValign?: 'top' | 'center' | 'bottom';
		labelMarginY?: number;
	};
}

export interface CytoscapeEdge {
	data: {
		id: string;
		source: string;
		target: string;
		label: string;
		relationship: string;
		category?: string; // Semantic category for styling
		strength?: number;
		color?: string;
		width?: number;
		lineStyle?: 'solid' | 'dashed' | 'dotted';
		arrowShape?: string;
	};
}

export interface GraphData {
	nodes: CytoscapeNode[];
	edges: CytoscapeEdge[];
}

export interface GraphSourceData {
	projects: OntoProject[];
	edges: OntoEdge[];
	tasks: OntoTask[];
	outputs: OntoOutput[];
	documents: OntoDocument[];
	plans: OntoPlan[];
	goals: OntoGoal[];
	milestones: OntoMilestone[];
	risks?: OntoRisk[];
	decisions?: OntoDecision[];
}

export interface GraphStats {
	totalProjects: number;
	activeProjects: number;
	totalEdges: number;
	totalTasks: number;
	totalOutputs: number;
	totalDocuments: number;
	totalPlans: number;
	totalGoals: number;
	totalMilestones: number;
	totalRisks: number;
	totalDecisions: number;
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
