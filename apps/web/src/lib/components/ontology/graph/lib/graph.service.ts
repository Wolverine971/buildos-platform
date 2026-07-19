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
	OntoPlan,
	OntoProject,
	OntoRisk,
	OntoTask,
	ViewMode
} from './graph.types';
import type { DocStructure, DocTreeNode } from '$lib/types/onto-api';

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
	document: ThemeColors;
	milestone: ThemeColors;
	risk: ThemeColors;
	states: Record<string, ThemeColors>;
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
	document: {
		light: { bg: '#e0f2fe', border: '#0284c7' },
		dark: { bg: '#0c4a6e', border: '#7dd3fc' }
	},
	milestone: {
		light: { bg: '#d1fae5', border: '#059669' },
		dark: { bg: '#064e3b', border: '#6ee7b7' }
	},
	risk: {
		light: { bg: '#fee2e2', border: '#dc2626' },
		dark: { bg: '#450a0a', border: '#f87171' }
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

	// Edge semantic colors
	edges: {
		hierarchical: { light: '#94a3b8', dark: '#64748b' },
		goalSupport: { light: '#d97706', dark: '#fbbf24' },
		// Dependency uses violet so it does not collide with the accent/selection orange.
		dependency: { light: '#7c3aed', dark: '#a78bfa' },
		blocking: { light: '#dc2626', dark: '#f87171' },
		temporal: { light: '#059669', dark: '#34d399' },
		knowledge: { light: '#0284c7', dark: '#38bdf8' }
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
	labelMaxWidth: number;
	labelMaxLines: number;
	labelMaxCharsPerLine: number;
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
		baseWidth: 92,
		baseHeight: 52,
		fontSize: 14,
		fontWeight: 800,
		labelValign: 'center',
		labelHalign: 'center',
		labelMaxWidth: 84,
		labelMaxLines: 2,
		labelMaxCharsPerLine: 16,
		// 4px frame + Cytoscape underlay halo (see OntologyGraph.svelte) gives projects
		// "stamped" presence against the tx-grid canvas — closest analog to wt-card weight.
		borderWidth: 4,
		borderStyle: 'solid'
	},
	goal: {
		// The Target glyph is painted into this circle in OntologyGraph.svelte.
		shape: 'ellipse',
		baseWidth: 48,
		baseHeight: 48,
		fontSize: 11,
		fontWeight: 700,
		labelValign: 'bottom',
		labelMarginY: 9,
		labelMaxWidth: 112,
		labelMaxLines: 3,
		labelMaxCharsPerLine: 18,
		borderWidth: 2,
		borderStyle: 'solid'
	},
	task: {
		shape: 'ellipse',
		baseWidth: 30,
		baseHeight: 30,
		fontSize: 11,
		fontWeight: 600,
		labelValign: 'bottom',
		labelMarginY: 8,
		labelMaxWidth: 112,
		labelMaxLines: 3,
		labelMaxCharsPerLine: 18,
		borderWidth: 2,
		borderStyle: 'solid'
	},
	plan: {
		shape: 'round-rectangle',
		baseWidth: 96,
		baseHeight: 54,
		fontSize: 11,
		fontWeight: 700,
		labelValign: 'center',
		labelHalign: 'center',
		labelMaxWidth: 90,
		labelMaxLines: 3,
		labelMaxCharsPerLine: 18,
		borderWidth: 2,
		borderStyle: 'dashed'
	},
	document: {
		shape: 'rectangle',
		baseWidth: 28,
		baseHeight: 34,
		fontSize: 11,
		fontWeight: 600,
		labelValign: 'bottom',
		labelMarginY: 7,
		labelMaxWidth: 112,
		labelMaxLines: 3,
		labelMaxCharsPerLine: 18,
		borderWidth: 1.5,
		borderStyle: 'solid'
	},
	milestone: {
		shape: 'triangle',
		baseWidth: 32,
		baseHeight: 34,
		fontSize: 11,
		fontWeight: 600,
		labelValign: 'bottom',
		labelMarginY: 8,
		labelMaxWidth: 112,
		labelMaxLines: 3,
		labelMaxCharsPerLine: 18,
		borderWidth: 2,
		borderStyle: 'solid'
	},
	risk: {
		shape: 'octagon',
		baseWidth: 32,
		baseHeight: 32,
		fontSize: 11,
		fontWeight: 600,
		labelValign: 'bottom',
		labelMarginY: 8,
		labelMaxWidth: 112,
		labelMaxLines: 3,
		labelMaxCharsPerLine: 18,
		borderWidth: 2,
		borderStyle: 'solid'
	},
	note: {
		shape: 'rectangle',
		baseWidth: 28,
		baseHeight: 34,
		fontSize: 11,
		fontWeight: 600,
		labelValign: 'bottom',
		labelMarginY: 7,
		labelMaxWidth: 104,
		labelMaxLines: 3,
		labelMaxCharsPerLine: 18,
		borderWidth: 1.5,
		borderStyle: 'dashed'
	},
	event: {
		shape: 'diamond',
		baseWidth: 34,
		baseHeight: 34,
		fontSize: 11,
		fontWeight: 600,
		labelValign: 'bottom',
		labelMarginY: 8,
		labelMaxWidth: 104,
		labelMaxLines: 3,
		labelMaxCharsPerLine: 18,
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

const FALLBACK_LABEL = 'Untitled';
const LABEL_OVERFLOW_MARKER = '…';
const PROJECT_CONTAINER_RELS = new Set([
	'project_contains',
	'contains',
	'part_of',
	'has_task',
	'has_plan',
	'has_goal',
	'has_document',
	'has_context_document',
	'has_milestone',
	'has_risk'
]);

type GraphNodeIcon = 'goal' | 'task' | 'document' | 'milestone' | 'risk';

const GRAPH_NODE_ICON_PATHS: Record<GraphNodeIcon, string[]> = {
	goal: [
		'<circle cx="12" cy="12" r="10"/>',
		'<circle cx="12" cy="12" r="6"/>',
		'<circle cx="12" cy="12" r="2"/>'
	],
	task: [
		'<path d="m3 6 1 1 2-2"/>',
		'<path d="M10 6h11"/>',
		'<path d="m3 12 1 1 2-2"/>',
		'<path d="M10 12h11"/>',
		'<path d="m3 18 1 1 2-2"/>',
		'<path d="M10 18h11"/>'
	],
	document: [
		'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>',
		'<path d="M14 2v6h6"/>',
		'<path d="M16 13H8"/>',
		'<path d="M16 17H8"/>'
	],
	milestone: ['<path d="M5 22V4"/>', '<path d="M5 4h12l-2 4 2 4H5"/>'],
	risk: [
		'<path d="M10.3 3.5 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.5a2 2 0 0 0-3.4 0Z"/>',
		'<path d="M12 9v4"/>',
		'<path d="M12 17h.01"/>'
	]
};

/**
 * Inline canonical entity glyphs as fully encoded data URIs. Cytoscape paints
 * these inside the semantic node silhouettes without adding DOM overlays.
 */
function buildNodeIconDataUri(icon: GraphNodeIcon, stroke: string): string {
	const svg = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
		...GRAPH_NODE_ICON_PATHS[icon],
		'</svg>'
	].join('');

	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

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

function splitLongWord(word: string, maxLength: number): string[] {
	if (word.length <= maxLength) return [word];

	const chunks: string[] = [];
	for (let index = 0; index < word.length; index += maxLength) {
		chunks.push(word.slice(index, index + maxLength));
	}
	return chunks;
}

function addOverflowMarker(line: string, maxLength: number): string {
	if (line.endsWith(LABEL_OVERFLOW_MARKER)) return line;
	if (line.length + LABEL_OVERFLOW_MARKER.length <= maxLength) {
		return `${line}${LABEL_OVERFLOW_MARKER}`;
	}

	const availableLength = Math.max(1, maxLength - LABEL_OVERFLOW_MARKER.length);
	return `${line.slice(0, availableLength).trimEnd()}${LABEL_OVERFLOW_MARKER}`;
}

function formatGraphLabel(label: string | null | undefined, config: NodeStyleConfig): string {
	const normalized = (label ?? FALLBACK_LABEL).replace(/\s+/g, ' ').trim() || FALLBACK_LABEL;
	const words = normalized.split(' ');
	const lines: string[] = [];
	let currentLine = '';
	let didOverflow = false;

	for (const word of words) {
		const wordParts = splitLongWord(word, config.labelMaxCharsPerLine);

		for (const wordPart of wordParts) {
			const candidate = currentLine ? `${currentLine} ${wordPart}` : wordPart;

			if (candidate.length <= config.labelMaxCharsPerLine) {
				currentLine = candidate;
				continue;
			}

			if (currentLine) {
				lines.push(currentLine);
				currentLine = wordPart;
			} else {
				lines.push(wordPart);
				currentLine = '';
			}

			if (lines.length >= config.labelMaxLines) {
				didOverflow = true;
				break;
			}
		}

		if (didOverflow) break;
	}

	if (!didOverflow && currentLine) {
		lines.push(currentLine);
	}

	if (lines.length > config.labelMaxLines) {
		lines.length = config.labelMaxLines;
		didOverflow = true;
	}

	if (didOverflow && lines.length > 0) {
		const lastIndex = lines.length - 1;
		lines[lastIndex] = addOverflowMarker(lines[lastIndex] ?? '', config.labelMaxCharsPerLine);
	}

	return lines.slice(0, config.labelMaxLines).join('\n');
}

function getLabelVisualData(label: string | null | undefined, config: NodeStyleConfig) {
	const isCentered = config.labelValign === 'center';

	return {
		label: label ?? FALLBACK_LABEL,
		displayLabel: formatGraphLabel(label, config),
		labelMaxWidth: config.labelMaxWidth,
		labelBackgroundOpacity: isCentered ? 0 : 0.86,
		labelBackgroundPadding: isCentered ? 0 : 2
	};
}

function asProjectId(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function assignProjectContainers(nodes: CytoscapeNode[], projects: OntoProject[]): CytoscapeNode[] {
	const projectIds = new Set(projects.map((project) => project.id));

	return nodes.map((node) => {
		if (node.data.type === 'project') return node;

		const projectId = asProjectId(node.data.metadata?.projectId);
		if (!projectId || !projectIds.has(projectId)) return node;

		return {
			...node,
			data: {
				...node.data,
				parent: projectId
			}
		};
	});
}

function isDirectProjectContainerEdge(edge: OntoEdge, projectIds: Set<string>): boolean {
	const srcIsProject = edge.src_kind === 'project' && projectIds.has(edge.src_id);
	const dstIsProject = edge.dst_kind === 'project' && projectIds.has(edge.dst_id);

	if (!srcIsProject && !dstIsProject) return false;
	if (srcIsProject && dstIsProject) return false;

	return PROJECT_CONTAINER_RELS.has(edge.rel);
}

function normalizeDocTreeNodes(value: unknown): DocTreeNode[] {
	if (!Array.isArray(value)) return [];

	const nodes: DocTreeNode[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') continue;
		const record = item as Record<string, unknown>;
		if (typeof record.id !== 'string' || record.id.length === 0) continue;

		nodes.push({
			id: record.id,
			order:
				typeof record.order === 'number' && Number.isFinite(record.order)
					? record.order
					: 0,
			children: normalizeDocTreeNodes(record.children)
		});
	}
	return nodes;
}

function normalizeDocStructure(value: unknown): DocStructure | null {
	if (!value) return null;

	if (typeof value === 'string') {
		try {
			return normalizeDocStructure(JSON.parse(value));
		} catch {
			return null;
		}
	}

	if (Array.isArray(value)) {
		return { version: 1, root: normalizeDocTreeNodes(value) };
	}

	if (typeof value !== 'object') return null;

	const record = value as Record<string, unknown>;
	return {
		version: typeof record.version === 'number' ? record.version : 1,
		root: normalizeDocTreeNodes(record.root)
	};
}

function buildEdgeIdentity(
	edge: Pick<OntoEdge, 'src_kind' | 'src_id' | 'dst_kind' | 'dst_id' | 'rel'>
) {
	return `${edge.rel}:${edge.src_kind}:${edge.src_id}:${edge.dst_kind}:${edge.dst_id}`;
}

function buildDocStructureEdges(projects: OntoProject[]): OntoEdge[] {
	const edges: OntoEdge[] = [];

	function visit(project: OntoProject, parent: DocTreeNode): void {
		for (const child of parent.children ?? []) {
			edges.push({
				id: `doc-structure:${project.id}:${parent.id}:${child.id}`,
				project_id: project.id,
				src_kind: 'document',
				src_id: parent.id,
				dst_kind: 'document',
				dst_id: child.id,
				rel: 'has_part',
				props: {
					source: 'doc_structure',
					derived: true
				},
				created_at: ''
			});
			visit(project, child);
		}
	}

	for (const project of projects) {
		const structure = normalizeDocStructure(project.doc_structure);
		for (const rootNode of structure?.root ?? []) {
			visit(project, rootNode);
		}
	}

	return edges;
}

function appendDocStructureEdges(edges: OntoEdge[], projects: OntoProject[]): OntoEdge[] {
	const existing = new Set(edges.map(buildEdgeIdentity));
	const derivedEdges = buildDocStructureEdges(projects).filter((edge) => {
		const identity = buildEdgeIdentity(edge);
		if (existing.has(identity)) return false;
		existing.add(identity);
		return true;
	});

	return derivedEdges.length > 0 ? [...edges, ...derivedEdges] : edges;
}

// ============================================================
// NODE TRANSFORMATION METHODS
// ============================================================

export class OntologyGraphService {
	static projectsToNodes(projects: OntoProject[], isDark = false): CytoscapeNode[] {
		const config = NODE_STYLE_CONFIG.project;
		const projectBase = isDark ? GRAPH_COLORS.project.dark : GRAPH_COLORS.project.light;

		return projects.map((project) => {
			const state = normalizeState(project.state_key);
			// Default-state projects ("draft" / "pending" / unknown) read as Projects, not
			// generic gray drafts — fall back to the project entity base, mirroring how
			// goals/plans/documents already handle their default states.
			const colors =
				state === 'draft' || state === 'pending'
					? projectBase
					: getStateColors(state, isDark);
			const scale = project.facet_scale ?? 'medium';
			const multiplier = SCALE_MULTIPLIERS[scale] ?? 1.0;
			const labelVisual = getLabelVisualData(project.name, config);

			return {
				data: {
					id: project.id,
					...labelVisual,
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
			const labelVisual = getLabelVisualData(goal.name, config);

			// Goals have special state colors
			let colors = baseColors;
			if (state === 'achieved' || state === 'complete') {
				colors = getStateColors('achieved', isDark);
			} else if (state === 'deferred') {
				colors = getStateColors('deferred', isDark);
			}

			// Target icon stroke matches the node border so the icon reads as
			// "this goal" rather than a foreign UI element.
			const iconImage = buildNodeIconDataUri('goal', colors.border);

			return {
				data: {
					id: goal.id,
					...labelVisual,
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
					iconImage,
					iconSize: 28,
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
		const iconStroke = isDark ? '#cbd5e1' : '#475569';

		return tasks.map((task) => {
			const state = normalizeState(task.state_key);
			const colors = getStateColors(state, isDark);
			const borderStyle = getStateBorderStyle(state);
			const borderMod = getStateBorderWidthModifier(state);
			const labelVisual = getLabelVisualData(task.title, config);
			// Keep the task glyph neutral and high-contrast; state remains encoded by
			// fill and border, so amber/green/red tasks retain one stable silhouette.
			const iconImage = buildNodeIconDataUri('task', iconStroke);

			return {
				data: {
					id: task.id,
					...labelVisual,
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
					iconImage,
					iconSize: 16,
					fontSize: config.fontSize,
					fontWeight: config.fontWeight ?? 400,
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
			const labelVisual = getLabelVisualData(plan.name, config);

			// Plans override colors for complete state
			let colors = baseColors;
			if (state === 'complete') {
				colors = getStateColors('complete', isDark);
			}

			return {
				data: {
					id: plan.id,
					...labelVisual,
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
					fontWeight: config.fontWeight ?? 400,
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
			const labelVisual = getLabelVisualData(document.title, config);
			const iconImage = buildNodeIconDataUri('document', baseColors.border);

			return {
				data: {
					id: document.id,
					...labelVisual,
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
					iconImage,
					iconSize: 16,
					fontSize: config.fontSize,
					fontWeight: config.fontWeight ?? 400,
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
			const labelVisual = getLabelVisualData(milestone.title, config);
			const iconImage = buildNodeIconDataUri('milestone', colors.border);

			return {
				data: {
					id: milestone.id,
					...labelVisual,
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
					iconImage,
					iconSize: 17,
					fontSize: config.fontSize,
					fontWeight: config.fontWeight ?? 400,
					labelValign: config.labelValign,
					labelMarginY: config.labelMarginY ?? 0
				}
			};
		});
	}

	static risksToNodes(risks: OntoRisk[], isDark = false): CytoscapeNode[] {
		const config = NODE_STYLE_CONFIG.risk;
		const baseColors = isDark ? GRAPH_COLORS.risk.dark : GRAPH_COLORS.risk.light;

		return risks.map((risk) => {
			const state = normalizeState(risk.state_key ?? 'identified');
			const labelVisual = getLabelVisualData(risk.title, config);

			// Risks use state-based colors
			let colors = baseColors;
			if (state === 'mitigated' || state === 'closed') {
				colors = getStateColors('complete', isDark);
			} else if (state === 'occurred') {
				colors = getStateColors('blocked', isDark);
			}
			const iconImage = buildNodeIconDataUri('risk', colors.border);

			return {
				data: {
					id: risk.id,
					...labelVisual,
					type: 'risk',
					state,
					metadata: {
						projectId: risk.project_id,
						typeKey: risk.type_key,
						state: risk.state_key,
						impact: risk.impact,
						probability: risk.probability,
						content: risk.content,
						mitigatedAt: risk.mitigated_at,
						props: risk.props
					},
					color: colors.bg,
					borderColor: colors.border,
					borderWidth: config.borderWidth,
					borderStyle: config.borderStyle,
					width: config.baseWidth,
					height: config.baseHeight,
					size: config.baseWidth,
					shape: config.shape,
					iconImage,
					iconSize: 17,
					fontSize: config.fontSize,
					fontWeight: config.fontWeight ?? 400,
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
			has_part: 'hierarchical',
			part_of: 'hierarchical',
			project_contains: 'hierarchical',

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
			has_context_document: 'knowledge'
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
			knowledge: { width: 1, lineStyle: 'dotted', arrowShape: 'circle' }
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
				const props =
					typeof edge.props === 'object' && edge.props !== null
						? (edge.props as Record<string, unknown>)
						: {};
				const inferred = props.inferred === true;
				const weight =
					'weight' in props && typeof props.weight === 'number'
						? Number(props.weight)
						: undefined;

				const baseStyle = this.getEdgeStyle(edge.rel, isDark);
				const style = inferred
					? {
							color: isDark ? '#71717a' : '#a1a1aa',
							width: 0.75,
							lineStyle: 'dotted' as const,
							arrowShape: 'none'
						}
					: baseStyle;
				const category = this.getEdgeCategory(edge.rel);

				return {
					data: {
						id: edge.id,
						source: edge.src_id,
						target: edge.dst_id,
						label: inferred ? 'project link' : edge.rel.replace(/_/g, ' '),
						relationship: edge.rel,
						category,
						strength: weight,
						inferred,
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
			'document',
			'plan',
			'goal',
			'milestone',
			'risk'
		]);

		const rawNodes: CytoscapeNode[] = [
			...this.projectsToNodes(data.projects, isDark),
			...this.tasksToNodes(data.tasks, isDark),
			...this.documentsToNodes(data.documents, isDark),
			...this.plansToNodes(data.plans, isDark),
			...this.goalsToNodes(data.goals, isDark),
			...this.milestonesToNodes(data.milestones, isDark),
			...this.risksToNodes(data.risks ?? [], isDark)
		];
		const nodes = assignProjectContainers(rawNodes, data.projects);
		const projectIds = new Set(data.projects.map((project) => project.id));

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

		const visualSourceEdges = appendDocStructureEdges(
			filteredSourceEdges,
			data.projects
		).filter((edge) => !isDirectProjectContainerEdge(edge, projectIds));
		const edges = this.edgesToCytoscape(visualSourceEdges, isDark);

		// Filter edges to only include those with valid source and target nodes
		const nodeIds = new Set(nodes.map((node) => node.data.id));
		const filteredEdges = edges.filter(
			(edge) => nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target)
		);

		return { nodes, edges: filteredEdges };
	}
}
