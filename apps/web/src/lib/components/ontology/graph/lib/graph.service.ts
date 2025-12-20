// apps/web/src/lib/components/ontology/graph/lib/graph.service.ts
/**
 * Ontology Graph Visualization Service
 *
 * Transforms ontology entities into Cytoscape-friendly payloads with
 * semantically meaningful styling aligned with the Inkprint Design System.
 *
 * Design Spec: /apps/web/docs/technical/components/ONTOLOGY_GRAPH_DESIGN_SPEC.md
 *
 * Visual Language:
 * - Shape carries primary meaning (instantly recognizable silhouettes)
 * - Color indicates state (active, complete, blocked, etc.)
 * - Size reflects scale/importance
 * - Border style shows entity lifecycle stage
 */

import type {
	CytoscapeEdge,
	CytoscapeNode,
	GraphData,
	GraphSourceData,
	NodeType,
	OntoDocument,
	OntoEdge,
	OntoGoal,
	OntoMilestone,
	OntoOutput,
	OntoPlan,
	OntoProject,
	OntoTask,
	ViewMode
} from './graph.types';

// ============================================================
// COLOR PALETTE - Inkprint Aligned
// ============================================================

/**
 * Semantic color palette for light and dark modes.
 * Colors match the project page icon colors for consistency.
 */
// Color types for type safety
interface ColorPair {
	bg: string;
	border: string;
}

interface ThemeColors {
	light: ColorPair;
	dark: ColorPair;
}

interface EdgeColors {
	light: string;
	dark: string;
}

export const GRAPH_COLORS: {
	accent: EdgeColors;
	project: ThemeColors;
	goal: ThemeColors;
	task: ThemeColors;
	plan: ThemeColors;
	output: ThemeColors;
	document: ThemeColors;
	milestone: ThemeColors;
	states: Record<string, ThemeColors>;
	primitives: Record<string, ThemeColors>;
	edges: Record<string, EdgeColors>;
} = {
	// Accent (BuildOS signal color - orange)
	accent: { light: '#ea580c', dark: '#fb923c' },

	// Entity base colors
	project: {
		light: { bg: '#f8fafc', border: '#334155' },
		dark: { bg: '#1e293b', border: '#e2e8f0' }
	},
	goal: {
		light: { bg: '#fef3c7', border: '#d97706' },
		dark: { bg: '#451a03', border: '#fbbf24' }
	},
	task: {
		light: { bg: '#f1f5f9', border: '#64748b' },
		dark: { bg: '#334155', border: '#94a3b8' }
	},
	plan: {
		light: { bg: '#e0e7ff', border: '#6366f1' },
		dark: { bg: '#312e81', border: '#a5b4fc' }
	},
	output: {
		light: { bg: '#ede9fe', border: '#7c3aed' },
		dark: { bg: '#4c1d95', border: '#c4b5fd' }
	},
	document: {
		light: { bg: '#e0f2fe', border: '#0284c7' },
		dark: { bg: '#0c4a6e', border: '#7dd3fc' }
	},
	milestone: {
		light: { bg: '#d1fae5', border: '#059669' },
		dark: { bg: '#064e3b', border: '#6ee7b7' }
	},

	// State colors (used across entity types)
	states: {
		draft: {
			light: { bg: '#f1f5f9', border: '#94a3b8' },
			dark: { bg: '#334155', border: '#64748b' }
		},
		todo: {
			light: { bg: '#f1f5f9', border: '#94a3b8' },
			dark: { bg: '#334155', border: '#64748b' }
		},
		active: {
			light: { bg: '#fff7ed', border: '#ea580c' },
			dark: { bg: '#431407', border: '#fb923c' }
		},
		in_progress: {
			light: { bg: '#fef3c7', border: '#f59e0b' },
			dark: { bg: '#451a03', border: '#fbbf24' }
		},
		complete: {
			light: { bg: '#d1fae5', border: '#10b981' },
			dark: { bg: '#064e3b', border: '#34d399' }
		},
		done: {
			light: { bg: '#d1fae5', border: '#10b981' },
			dark: { bg: '#064e3b', border: '#34d399' }
		},
		achieved: {
			light: { bg: '#d1fae5', border: '#10b981' },
			dark: { bg: '#064e3b', border: '#34d399' }
		},
		blocked: {
			light: { bg: '#fee2e2', border: '#ef4444' },
			dark: { bg: '#450a0a', border: '#f87171' }
		},
		archived: {
			light: { bg: '#f1f5f9', border: '#64748b' },
			dark: { bg: '#1e293b', border: '#475569' }
		},
		deferred: {
			light: { bg: '#fed7aa', border: '#f97316' },
			dark: { bg: '#431407', border: '#fb923c' }
		},
		missed: {
			light: { bg: '#fecaca', border: '#ef4444' },
			dark: { bg: '#450a0a', border: '#f87171' }
		},
		pending: {
			light: { bg: '#e2e8f0', border: '#64748b' },
			dark: { bg: '#334155', border: '#94a3b8' }
		},
		review: {
			light: { bg: '#fef3c7', border: '#eab308' },
			dark: { bg: '#422006', border: '#facc15' }
		},
		approved: {
			light: { bg: '#dbeafe', border: '#3b82f6' },
			dark: { bg: '#1e3a8a', border: '#60a5fa' }
		},
		published: {
			light: { bg: '#d1fae5', border: '#10b981' },
			dark: { bg: '#064e3b', border: '#34d399' }
		}
	},

	// Output primitive colors
	primitives: {
		document: {
			light: { bg: '#dbeafe', border: '#3b82f6' },
			dark: { bg: '#1e3a8a', border: '#93c5fd' }
		},
		event: {
			light: { bg: '#ede9fe', border: '#8b5cf6' },
			dark: { bg: '#4c1d95', border: '#c4b5fd' }
		},
		collection: {
			light: { bg: '#fef3c7', border: '#f59e0b' },
			dark: { bg: '#451a03', border: '#fcd34d' }
		},
		external: {
			light: { bg: '#d1fae5', border: '#10b981' },
			dark: { bg: '#064e3b', border: '#6ee7b7' }
		}
	},

	// Edge semantic colors
	edges: {
		hierarchical: { light: '#94a3b8', dark: '#64748b' },
		goalSupport: { light: '#d97706', dark: '#fbbf24' },
		dependency: { light: '#ea580c', dark: '#fb923c' },
		blocking: { light: '#dc2626', dark: '#f87171' },
		temporal: { light: '#059669', dark: '#34d399' },
		knowledge: { light: '#0284c7', dark: '#38bdf8' },
		production: { light: '#7c3aed', dark: '#a78bfa' }
	}
};

// ============================================================
// NODE CONFIGURATION
// ============================================================

interface NodeStyleConfig {
	shape: string;
	baseWidth: number;
	baseHeight: number;
	fontSize: number;
	fontWeight?: number;
	labelValign: 'top' | 'center' | 'bottom';
	labelHalign?: 'left' | 'center' | 'right';
	labelMarginY?: number;
	borderWidth: number;
	borderStyle?: 'solid' | 'dashed' | 'dotted';
}

/**
 * Node styling configuration by entity type.
 * Shape is the primary visual differentiator.
 */
export const NODE_STYLE_CONFIG: Record<NodeType, NodeStyleConfig> = {
	project: {
		shape: 'round-rectangle',
		baseWidth: 50,
		baseHeight: 40,
		fontSize: 11,
		fontWeight: 600,
		labelValign: 'center',
		labelHalign: 'center',
		borderWidth: 3,
		borderStyle: 'solid'
	},
	goal: {
		shape: 'star',
		baseWidth: 38,
		baseHeight: 38,
		fontSize: 9,
		fontWeight: 600,
		labelValign: 'bottom',
		labelMarginY: 8,
		borderWidth: 2,
		borderStyle: 'solid'
	},
	task: {
		shape: 'ellipse',
		baseWidth: 26,
		baseHeight: 26,
		fontSize: 9,
		labelValign: 'bottom',
		labelMarginY: 6,
		borderWidth: 2,
		borderStyle: 'solid'
	},
	plan: {
		shape: 'round-rectangle',
		baseWidth: 36,
		baseHeight: 28,
		fontSize: 10,
		labelValign: 'center',
		labelHalign: 'center',
		borderWidth: 2,
		borderStyle: 'dashed'
	},
	output: {
		shape: 'diamond',
		baseWidth: 30,
		baseHeight: 30,
		fontSize: 9,
		labelValign: 'bottom',
		labelMarginY: 8,
		borderWidth: 2,
		borderStyle: 'solid'
	},
	document: {
		shape: 'rectangle',
		baseWidth: 22,
		baseHeight: 28,
		fontSize: 8,
		labelValign: 'bottom',
		labelMarginY: 4,
		borderWidth: 1,
		borderStyle: 'solid'
	},
	milestone: {
		shape: 'triangle',
		baseWidth: 26,
		baseHeight: 30,
		fontSize: 9,
		labelValign: 'bottom',
		labelMarginY: 6,
		borderWidth: 2,
		borderStyle: 'solid'
	}
};

/**
 * Project scale to size multiplier mapping.
 */
const SCALE_MULTIPLIERS: Record<string, number> = {
	micro: 0.7,
	small: 0.85,
	medium: 1.0,
	large: 1.2,
	epic: 1.4
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Normalize state keys to standard values.
 */
function normalizeState(state: string | null | undefined): string {
	const s = (state ?? 'draft').toLowerCase();

	// Map common variants to standard states
	const stateMap: Record<string, string> = {
		completed: 'complete',
		shipped: 'complete',
		finished: 'complete',
		in_review: 'review',
		reviewing: 'review',
		drafting: 'draft',
		started: 'in_progress',
		working: 'in_progress'
	};

	return stateMap[s] ?? s;
}

/**
 * Get colors for a given state, with fallback.
 */
function getStateColors(state: string, isDark = false): { bg: string; border: string } {
	const normalized = normalizeState(state);
	const stateColors = GRAPH_COLORS.states[normalized as keyof typeof GRAPH_COLORS.states];

	if (stateColors) {
		return isDark ? stateColors.dark : stateColors.light;
	}

	// Fallback to draft colors (always exists)
	const draftLight = { bg: '#f1f5f9', border: '#94a3b8' };
	const draftDark = { bg: '#334155', border: '#64748b' };
	return isDark ? draftDark : draftLight;
}

/**
 * Get border style based on state (lifecycle indication).
 */
function getStateBorderStyle(state: string): 'solid' | 'dashed' | 'dotted' {
	const normalized = normalizeState(state);

	switch (normalized) {
		case 'draft':
			return 'dotted';
		case 'review':
		case 'pending':
			return 'dashed';
		case 'archived':
			return 'dashed';
		default:
			return 'solid';
	}
}

/**
 * Get border width modifier based on state.
 */
function getStateBorderWidthModifier(state: string): number {
	const normalized = normalizeState(state);

	switch (normalized) {
		case 'blocked':
			return 1; // +1px for blocked items
		case 'in_progress':
		case 'active':
			return 0.5;
		default:
			return 0;
	}
}

/**
 * Extract deliverable primitive from output type_key.
 */
function extractPrimitive(typeKey: string): string {
	const parts = typeKey.split('.');
	return parts[1] ?? 'document';
}

// ============================================================
// NODE TRANSFORMATION METHODS
// ============================================================

export class OntologyGraphService {
	static projectsToNodes(projects: OntoProject[], isDark = false): CytoscapeNode[] {
		const config = NODE_STYLE_CONFIG.project;

		return projects.map((project) => {
			const state = normalizeState(project.state_key);
			const colors = getStateColors(state, isDark);
			const scale = project.facet_scale ?? 'medium';
			const multiplier = SCALE_MULTIPLIERS[scale] ?? 1.0;

			return {
				data: {
					id: project.id,
					label: project.name,
					type: 'project',
					state,
					metadata: {
						description: project.description,
						typeKey: project.type_key,
						state: project.state_key,
						context: project.facet_context,
						scale: project.facet_scale,
						stage: project.facet_stage,
						createdBy: project.created_by,
						props: project.props
					},
					// Visual properties
					color: colors.bg,
					borderColor: colors.border,
					borderWidth: config.borderWidth,
					borderStyle: config.borderStyle,
					width: Math.round(config.baseWidth * multiplier),
					height: Math.round(config.baseHeight * multiplier),
					size: Math.round(config.baseWidth * multiplier),
					shape: config.shape,
					fontSize: config.fontSize,
					fontWeight: config.fontWeight ?? 400,
					labelValign: config.labelValign,
					labelMarginY: config.labelMarginY ?? 0
				}
			};
		});
	}

	static goalsToNodes(goals: OntoGoal[], isDark = false): CytoscapeNode[] {
		const config = NODE_STYLE_CONFIG.goal;
		const baseColors = isDark ? GRAPH_COLORS.goal.dark : GRAPH_COLORS.goal.light;

		return goals.map((goal) => {
			const state = normalizeState((goal as any).state_key ?? 'active');

			// Goals have special state colors
			let colors = baseColors;
			if (state === 'achieved' || state === 'complete') {
				colors = getStateColors('achieved', isDark);
			} else if (state === 'deferred') {
				colors = getStateColors('deferred', isDark);
			}

			return {
				data: {
					id: goal.id,
					label: goal.name,
					type: 'goal',
					state,
					metadata: {
						projectId: goal.project_id,
						typeKey: goal.type_key,
						props: goal.props
					},
					color: colors.bg,
					borderColor: colors.border,
					borderWidth: config.borderWidth,
					borderStyle: config.borderStyle,
					width: config.baseWidth,
					height: config.baseHeight,
					size: config.baseWidth,
					shape: config.shape,
					fontSize: config.fontSize,
					fontWeight: config.fontWeight ?? 400,
					labelValign: config.labelValign,
					labelMarginY: config.labelMarginY ?? 0
				}
			};
		});
	}

	static tasksToNodes(tasks: OntoTask[], isDark = false): CytoscapeNode[] {
		const config = NODE_STYLE_CONFIG.task;

		return tasks.map((task) => {
			const state = normalizeState(task.state_key);
			const colors = getStateColors(state, isDark);
			const borderStyle = getStateBorderStyle(state);
			const borderMod = getStateBorderWidthModifier(state);

			return {
				data: {
					id: task.id,
					label: task.title,
					type: 'task',
					state,
					metadata: {
						projectId: task.project_id,
						state: task.state_key,
						priority: task.priority,
						dueAt: task.due_at,
						props: task.props
					},
					color: colors.bg,
					borderColor: colors.border,
					borderWidth: config.borderWidth + borderMod,
					borderStyle,
					width: config.baseWidth,
					height: config.baseHeight,
					size: config.baseWidth,
					shape: config.shape,
					fontSize: config.fontSize,
					labelValign: config.labelValign,
					labelMarginY: config.labelMarginY ?? 0
				}
			};
		});
	}

	static plansToNodes(plans: OntoPlan[], isDark = false): CytoscapeNode[] {
		const config = NODE_STYLE_CONFIG.plan;
		const baseColors = isDark ? GRAPH_COLORS.plan.dark : GRAPH_COLORS.plan.light;

		return plans.map((plan) => {
			const state = normalizeState(plan.state_key);

			// Plans override colors for complete state
			let colors = baseColors;
			if (state === 'complete') {
				colors = getStateColors('complete', isDark);
			}

			return {
				data: {
					id: plan.id,
					label: plan.name,
					type: 'plan',
					state,
					metadata: {
						projectId: plan.project_id,
						typeKey: plan.type_key,
						state: plan.state_key,
						props: plan.props
					},
					color: colors.bg,
					borderColor: colors.border,
					borderWidth: config.borderWidth,
					borderStyle: config.borderStyle, // Always dashed for plans
					width: config.baseWidth,
					height: config.baseHeight,
					size: config.baseWidth,
					shape: config.shape,
					fontSize: config.fontSize,
					labelValign: config.labelValign,
					labelMarginY: config.labelMarginY ?? 0
				}
			};
		});
	}

	static outputsToNodes(outputs: OntoOutput[], isDark = false): CytoscapeNode[] {
		const config = NODE_STYLE_CONFIG.output;

		return outputs.map((output) => {
			const state = normalizeState(output.state_key);
			const primitive = extractPrimitive(output.type_key ?? 'output.document');
			const primitiveColors =
				GRAPH_COLORS.primitives[primitive as keyof typeof GRAPH_COLORS.primitives];
			const colors = primitiveColors
				? isDark
					? primitiveColors.dark
					: primitiveColors.light
				: isDark
					? GRAPH_COLORS.output.dark
					: GRAPH_COLORS.output.light;

			// Border style indicates lifecycle stage
			const borderStyle = getStateBorderStyle(state);

			return {
				data: {
					id: output.id,
					label: output.name,
					type: 'output',
					state,
					primitive,
					metadata: {
						projectId: output.project_id,
						typeKey: output.type_key,
						state: output.state_key,
						primitive,
						props: output.props
					},
					color: colors.bg,
					borderColor: colors.border,
					borderWidth: config.borderWidth,
					borderStyle,
					width: config.baseWidth,
					height: config.baseHeight,
					size: config.baseWidth,
					shape: config.shape,
					fontSize: config.fontSize,
					labelValign: config.labelValign,
					labelMarginY: config.labelMarginY ?? 0
				}
			};
		});
	}

	static documentsToNodes(documents: OntoDocument[], isDark = false): CytoscapeNode[] {
		const config = NODE_STYLE_CONFIG.document;
		const baseColors = isDark ? GRAPH_COLORS.document.dark : GRAPH_COLORS.document.light;

		return documents.map((document) => {
			const state = normalizeState(document.state_key);

			return {
				data: {
					id: document.id,
					label: document.title,
					type: 'document',
					state,
					metadata: {
						projectId: document.project_id,
						typeKey: document.type_key,
						state: document.state_key,
						props: document.props
					},
					color: baseColors.bg,
					borderColor: baseColors.border,
					borderWidth: config.borderWidth,
					borderStyle: config.borderStyle,
					width: config.baseWidth,
					height: config.baseHeight,
					size: config.baseWidth,
					shape: config.shape,
					fontSize: config.fontSize,
					labelValign: config.labelValign,
					labelMarginY: config.labelMarginY ?? 0
				}
			};
		});
	}

	static milestonesToNodes(milestones: OntoMilestone[], isDark = false): CytoscapeNode[] {
		const config = NODE_STYLE_CONFIG.milestone;

		return milestones.map((milestone) => {
			// Milestones have state in props
			const propsState = (milestone.props as Record<string, unknown>)?.state_key;
			const state = normalizeState((propsState as string) ?? 'pending');
			const colors = getStateColors(state, isDark);

			return {
				data: {
					id: milestone.id,
					label: milestone.name,
					type: 'milestone',
					state,
					metadata: {
						projectId: milestone.project_id,
						dueAt: milestone.due_at,
						props: milestone.props
					},
					color: colors.bg,
					borderColor: colors.border,
					borderWidth: config.borderWidth,
					borderStyle: config.borderStyle,
					width: config.baseWidth,
					height: config.baseHeight,
					size: config.baseWidth,
					shape: config.shape,
					fontSize: config.fontSize,
					labelValign: config.labelValign,
					labelMarginY: config.labelMarginY ?? 0
				}
			};
		});
	}

	// ============================================================
	// EDGE STYLING
	// ============================================================

	/**
	 * Categorize relationships into semantic groups for styling.
	 */
	static getEdgeCategory(rel: string): keyof typeof GRAPH_COLORS.edges {
		const categories: Record<string, keyof typeof GRAPH_COLORS.edges> = {
			// Hierarchical (structural)
			belongs_to_plan: 'hierarchical',
			has_task: 'hierarchical',
			contains: 'hierarchical',
			has_plan: 'hierarchical',
			part_of: 'hierarchical',

			// Goal support
			supports_goal: 'goalSupport',
			requires: 'goalSupport',
			achieved_by: 'goalSupport',
			has_goal: 'goalSupport',
			contributes_to: 'goalSupport',

			// Dependencies
			depends_on: 'dependency',

			// Blocking (more severe than dependency)
			blocks: 'blocking',
			blocked_by: 'blocking',

			// Temporal
			targets_milestone: 'temporal',
			has_milestone: 'temporal',
			scheduled_for: 'temporal',

			// Knowledge
			references: 'knowledge',
			referenced_by: 'knowledge',
			has_document: 'knowledge',
			has_context_document: 'knowledge',

			// Production
			produces: 'production',
			produced_by: 'production',
			has_output: 'production'
		};

		return categories[rel] ?? 'hierarchical';
	}

	/**
	 * Get edge styling based on relationship type.
	 */
	static getEdgeStyle(
		rel: string,
		isDark = false
	): {
		color: string;
		width: number;
		lineStyle: 'solid' | 'dashed' | 'dotted';
		arrowShape: string;
	} {
		const category = this.getEdgeCategory(rel);

		// Default hierarchical style colors
		const defaultColors = { light: '#94a3b8', dark: '#64748b' };
		const colors = GRAPH_COLORS.edges[category] ?? defaultColors;
		const color = isDark ? colors.dark : colors.light;

		// Define styles per category
		type EdgeStyle = {
			width: number;
			lineStyle: 'solid' | 'dashed' | 'dotted';
			arrowShape: string;
		};
		const defaultStyle: EdgeStyle = { width: 1, lineStyle: 'solid', arrowShape: 'triangle' };

		const categoryStyles: Record<string, EdgeStyle> = {
			hierarchical: { width: 1, lineStyle: 'solid', arrowShape: 'triangle' },
			goalSupport: { width: 2, lineStyle: 'solid', arrowShape: 'triangle-backcurve' },
			dependency: { width: 2, lineStyle: 'dashed', arrowShape: 'vee' },
			blocking: { width: 2, lineStyle: 'solid', arrowShape: 'tee' },
			temporal: { width: 2, lineStyle: 'solid', arrowShape: 'triangle' },
			knowledge: { width: 1, lineStyle: 'dotted', arrowShape: 'circle' },
			production: { width: 2, lineStyle: 'solid', arrowShape: 'diamond' }
		};

		const style = categoryStyles[category] ?? defaultStyle;
		return {
			color,
			width: style.width,
			lineStyle: style.lineStyle,
			arrowShape: style.arrowShape
		};
	}

	static edgesToCytoscape(edges: OntoEdge[], isDark = false): CytoscapeEdge[] {
		return edges
			.filter((edge) => edge.src_id && edge.dst_id && edge.src_id !== edge.dst_id)
			.map((edge) => {
				const weight =
					typeof edge.props === 'object' &&
					edge.props !== null &&
					'weight' in edge.props &&
					typeof (edge.props as Record<string, unknown>).weight === 'number'
						? Number((edge.props as Record<string, unknown>).weight)
						: undefined;

				const style = this.getEdgeStyle(edge.rel, isDark);
				const category = this.getEdgeCategory(edge.rel);

				return {
					data: {
						id: edge.id,
						source: edge.src_id,
						target: edge.dst_id,
						label: edge.rel.replace(/_/g, ' '),
						relationship: edge.rel,
						category,
						strength: weight,
						color: style.color,
						width: style.width,
						lineStyle: style.lineStyle,
						arrowShape: style.arrowShape
					}
				};
			});
	}

	// ============================================================
	// GRAPH BUILDING
	// ============================================================

	static buildGraphData(data: GraphSourceData, viewMode: ViewMode, isDark = false): GraphData {
		const allowedKinds = new Set([
			'project',
			'task',
			'output',
			'document',
			'plan',
			'goal',
			'milestone'
		]);

		const nodes: CytoscapeNode[] = [
			...this.projectsToNodes(data.projects, isDark),
			...this.tasksToNodes(data.tasks, isDark),
			...this.outputsToNodes(data.outputs, isDark),
			...this.documentsToNodes(data.documents, isDark),
			...this.plansToNodes(data.plans, isDark),
			...this.goalsToNodes(data.goals, isDark),
			...this.milestonesToNodes(data.milestones, isDark)
		];

		const filteredSourceEdges =
			viewMode === 'projects'
				? data.edges.filter(
						(edge) => allowedKinds.has(edge.src_kind) && allowedKinds.has(edge.dst_kind)
					)
				: data.edges.filter(
						(edge) =>
							!edge.src_kind ||
							!edge.dst_kind ||
							(allowedKinds.has(edge.src_kind) && allowedKinds.has(edge.dst_kind))
					);

		const edges = this.edgesToCytoscape(filteredSourceEdges, isDark);

		// Filter edges to only include those with valid source and target nodes
		const nodeIds = new Set(nodes.map((node) => node.data.id));
		const filteredEdges = edges.filter(
			(edge) => nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target)
		);

		return { nodes, edges: filteredEdges };
	}
}
