// apps/web/src/lib/components/ontology/templates/fsm-editor.types.ts

/**
 * FSM State Definition
 * Represents a single state in a finite state machine
 */
export interface FsmState {
	label: string;
	metadata?: {
		initial?: boolean;
		final?: boolean;
		description?: string;
		[key: string]: unknown;
	};
}

/**
 * FSM Transition Definition
 * Represents a transition between two states
 */
export interface FsmTransition {
	id?: string;
	from: string;
	to: string;
	on: string; // Event/trigger name
	label?: string;
	guard?: string; // Condition expression (optional)
	actions?: string[]; // Actions to execute (optional)
}

/**
 * Complete FSM Definition
 * Matches the structure stored in onto_templates.fsm column
 */
export interface FsmDefinition {
	states: Record<string, FsmState>;
	transitions: FsmTransition[];
	metadata?: {
		description?: string;
		[key: string]: unknown;
	};
}

/**
 * FSM Validation Result
 */
export interface FsmValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Helper type for Cytoscape node data in FSM editor
 */
export interface FsmCytoscapeNode {
	data: {
		id: string;
		label: string;
		stateKey: string;
		color: string;
		borderColor: string;
		width: number;
		height: number;
	};
}

/**
 * Helper type for Cytoscape edge data in FSM editor
 */
export interface FsmCytoscapeEdge {
	data: {
		id: string;
		source: string;
		target: string;
		label: string;
		transitionId: string;
	};
}
