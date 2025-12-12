// apps/web/src/lib/components/ontology/graph/lib/g6.service.ts
import type {
	GraphSourceData,
	OntoDocument,
	OntoGoal,
	OntoMilestone,
	OntoOutput,
	OntoPlan,
	OntoProject,
	OntoTask,
	ViewMode
} from './graph.types';

export interface G6NodeData {
	id: string;
	label: string;
	nodeType: string;
	metadata?: Record<string, unknown>;
	style: {
		fill: string;
		stroke: string;
		lineWidth: number;
	};
	labelCfg?: {
		style: {
			fill: string;
			fontSize: number;
		};
	};
	size?: number | [number, number];
	type?: string; // G6 node shape type
}

export interface G6EdgeData {
	id: string;
	source: string;
	target: string;
	label?: string;
	relationship: string;
	style: {
		stroke: string;
		lineWidth: number;
		lineDash?: number[];
		endArrow: boolean | { path: string; fill: string };
	};
}

export interface G6GraphData {
	nodes: G6NodeData[];
	edges: G6EdgeData[];
}

/**
 * Transform ontology entities into G6-compatible graph data format.
 * G6 offers high-performance rendering for large graphs (30k+ nodes).
 */
export class G6GraphService {
	static projectsToNodes(projects: OntoProject[]): G6NodeData[] {
		const defaultColors = { fill: '#f3f4f6', stroke: '#9ca3af', text: '#6b7280' };
		const stateColors: Record<string, { fill: string; stroke: string; text: string }> = {
			draft: defaultColors,
			active: { fill: '#d1fae5', stroke: '#10b981', text: '#047857' },
			complete: { fill: '#dbeafe', stroke: '#3b82f6', text: '#1d4ed8' },
			archived: { fill: '#e5e7eb', stroke: '#6b7280', text: '#4b5563' }
		};

		const scaleToSize: Record<string, number> = {
			micro: 30,
			small: 35,
			medium: 45,
			large: 55,
			epic: 65
		};

		return projects.map((project) => {
			const colors = stateColors[project.state_key] ?? defaultColors;
			return {
				id: project.id,
				label: project.name,
				nodeType: 'project',
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
				type: 'rect',
				size: [scaleToSize[project.facet_scale ?? 'medium'] ?? 45, 35],
				style: {
					fill: colors.fill,
					stroke: colors.stroke,
					lineWidth: 2,
					radius: 8
				},
				labelCfg: {
					style: {
						fill: colors.text,
						fontSize: 12,
						fontWeight: 600
					}
				}
			};
		});
	}

	static tasksToNodes(tasks: OntoTask[]): G6NodeData[] {
		const defaultColors = { fill: '#f3f4f6', stroke: '#6b7280' };
		const stateColors: Record<string, { fill: string; stroke: string }> = {
			done: { fill: '#d1fae5', stroke: '#10b981' },
			completed: { fill: '#d1fae5', stroke: '#10b981' },
			complete: { fill: '#d1fae5', stroke: '#10b981' },
			in_progress: { fill: '#fef3c7', stroke: '#f59e0b' },
			active: { fill: '#fef3c7', stroke: '#f59e0b' },
			todo: defaultColors,
			draft: defaultColors
		};

		return tasks.map((task) => {
			const colors = stateColors[task.state_key ?? 'todo'] ?? defaultColors;
			return {
				id: task.id,
				label: task.title,
				nodeType: 'task',
				metadata: {
					projectId: task.project_id,
					state: task.state_key,
					priority: task.priority,
					dueAt: task.due_at,
					scale: task.facet_scale,
					props: task.props
				},
				type: 'circle',
				size: 25,
				style: {
					fill: colors.fill,
					stroke: colors.stroke,
					lineWidth: 2
				},
				labelCfg: {
					style: {
						fill: '#374151',
						fontSize: 10
					}
				}
			};
		});
	}

	static outputsToNodes(outputs: OntoOutput[]): G6NodeData[] {
		const defaultColors = { fill: '#dbeafe', stroke: '#3b82f6' };
		const primitiveColors: Record<string, { fill: string; stroke: string }> = {
			document: defaultColors,
			event: { fill: '#ede9fe', stroke: '#8b5cf6' },
			collection: { fill: '#fef3c7', stroke: '#f59e0b' },
			external: { fill: '#d1fae5', stroke: '#10b981' }
		};

		return outputs.map((output) => {
			const parts = (output.type_key ?? '').split('.');
			const primitive = parts[1] ?? 'document';
			const colors = primitiveColors[primitive] ?? defaultColors;

			return {
				id: output.id,
				label: output.name,
				nodeType: 'output',
				metadata: {
					projectId: output.project_id,
					typeKey: output.type_key,
					state: output.state_key,
					stage: output.facet_stage,
					primitive,
					props: output.props
				},
				type: 'diamond',
				size: 30,
				style: {
					fill: colors.fill,
					stroke: colors.stroke,
					lineWidth: 2
				},
				labelCfg: {
					style: {
						fill: '#374151',
						fontSize: 10
					}
				}
			};
		});
	}

	static documentsToNodes(documents: OntoDocument[]): G6NodeData[] {
		return documents.map((document) => ({
			id: document.id,
			label: document.title,
			nodeType: 'document',
			metadata: {
				projectId: document.project_id,
				typeKey: document.type_key,
				state: document.state_key,
				props: document.props
			},
			type: 'rect',
			size: [28, 22],
			style: {
				fill: '#cffafe',
				stroke: '#06b6d4',
				lineWidth: 2,
				radius: 2
			},
			labelCfg: {
				style: {
					fill: '#0891b2',
					fontSize: 10
				}
			}
		}));
	}

	static plansToNodes(plans: OntoPlan[]): G6NodeData[] {
		const defaultColors = { fill: '#f1f5f9', stroke: '#94a3b8' };
		const stateColors: Record<string, { fill: string; stroke: string }> = {
			draft: defaultColors,
			active: { fill: '#e0e7ff', stroke: '#6366f1' },
			complete: { fill: '#c7d2fe', stroke: '#4f46e5' },
			archived: { fill: '#e5e7eb', stroke: '#6b7280' }
		};

		return plans.map((plan) => {
			const colors = stateColors[plan.state_key ?? 'draft'] ?? defaultColors;
			return {
				id: plan.id,
				label: plan.name,
				nodeType: 'plan',
				metadata: {
					projectId: plan.project_id,
					typeKey: plan.type_key,
					state: plan.state_key,
					props: plan.props
				},
				type: 'rect',
				size: [40, 28],
				style: {
					fill: colors.fill,
					stroke: colors.stroke,
					lineWidth: 2,
					radius: 6
				},
				labelCfg: {
					style: {
						fill: '#4338ca',
						fontSize: 11,
						fontWeight: 500
					}
				}
			};
		});
	}

	static goalsToNodes(goals: OntoGoal[]): G6NodeData[] {
		return goals.map((goal) => ({
			id: goal.id,
			label: goal.name,
			nodeType: 'goal',
			metadata: {
				projectId: goal.project_id,
				typeKey: goal.type_key,
				props: goal.props
			},
			type: 'star',
			size: 45,
			style: {
				fill: '#fef3c7',
				stroke: '#f59e0b',
				lineWidth: 2
			},
			labelCfg: {
				style: {
					fill: '#b45309',
					fontSize: 12,
					fontWeight: 600
				}
			}
		}));
	}

	static milestonesToNodes(milestones: OntoMilestone[]): G6NodeData[] {
		return milestones.map((milestone) => ({
			id: milestone.id,
			label: milestone.title,
			nodeType: 'milestone',
			metadata: {
				projectId: milestone.project_id,
				dueAt: milestone.due_at,
				props: milestone.props
			},
			type: 'triangle',
			size: 32,
			style: {
				fill: '#d1fae5',
				stroke: '#10b981',
				lineWidth: 2
			},
			labelCfg: {
				style: {
					fill: '#047857',
					fontSize: 10
				}
			}
		}));
	}

	static getEdgeStyle(rel: string): {
		stroke: string;
		lineWidth: number;
		lineDash?: number[];
		animated?: boolean;
	} {
		const styles: Record<
			string,
			{ stroke: string; lineWidth: number; lineDash?: number[]; animated?: boolean }
		> = {
			// Hierarchical relationships
			belongs_to_plan: { stroke: '#6b7280', lineWidth: 2 },
			has_task: { stroke: '#6b7280', lineWidth: 2 },
			contains: { stroke: '#6b7280', lineWidth: 2 },
			has_plan: { stroke: '#6b7280', lineWidth: 2 },
			// Goal support relationships
			supports_goal: { stroke: '#f59e0b', lineWidth: 3, animated: true },
			requires: { stroke: '#f59e0b', lineWidth: 3, animated: true },
			achieved_by: { stroke: '#f59e0b', lineWidth: 3, animated: true },
			has_goal: { stroke: '#f59e0b', lineWidth: 2 },
			// Dependency relationships
			depends_on: { stroke: '#f97316', lineWidth: 2, lineDash: [5, 5] },
			blocks: { stroke: '#ef4444', lineWidth: 2, lineDash: [5, 5] },
			// Temporal/milestone relationships
			targets_milestone: { stroke: '#10b981', lineWidth: 2 },
			has_milestone: { stroke: '#10b981', lineWidth: 2 },
			// Knowledge/document relationships
			references: { stroke: '#3b82f6', lineWidth: 1 },
			referenced_by: { stroke: '#3b82f6', lineWidth: 1 },
			has_document: { stroke: '#3b82f6', lineWidth: 1 },
			has_context_document: { stroke: '#3b82f6', lineWidth: 2 },
			// Production/output relationships
			produces: { stroke: '#8b5cf6', lineWidth: 2 },
			produced_by: { stroke: '#8b5cf6', lineWidth: 2 },
			has_output: { stroke: '#8b5cf6', lineWidth: 2 }
		};
		return styles[rel] ?? { stroke: '#9ca3af', lineWidth: 1 };
	}

	static edgesToG6(
		edges: { id: string; src_id: string; dst_id: string; rel: string }[]
	): G6EdgeData[] {
		return edges
			.filter((edge) => edge.src_id && edge.dst_id && edge.src_id !== edge.dst_id)
			.map((edge) => {
				const style = this.getEdgeStyle(edge.rel);
				return {
					id: edge.id,
					source: edge.src_id,
					target: edge.dst_id,
					label: edge.rel,
					relationship: edge.rel,
					style: {
						stroke: style.stroke,
						lineWidth: style.lineWidth,
						lineDash: style.lineDash,
						endArrow: {
							path: 'M 0,0 L 8,4 L 8,-4 Z',
							fill: style.stroke
						}
					}
				};
			});
	}

	static buildGraphData(data: GraphSourceData, viewMode: ViewMode): G6GraphData {
		let nodes: G6NodeData[] = [];
		let edges: G6EdgeData[] = [];

		const allowedKinds = new Set([
			'project',
			'task',
			'output',
			'document',
			'plan',
			'goal',
			'milestone'
		]);

		nodes = [
			...this.projectsToNodes(data.projects),
			...this.tasksToNodes(data.tasks),
			...this.outputsToNodes(data.outputs),
			...this.documentsToNodes(data.documents),
			...this.plansToNodes(data.plans),
			...this.goalsToNodes(data.goals),
			...this.milestonesToNodes(data.milestones)
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

		edges = this.edgesToG6(filteredSourceEdges);

		// Filter edges to only include those connecting existing nodes
		const nodeIds = new Set(nodes.map((node) => node.id));
		const filteredEdges = edges.filter(
			(edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
		);

		return { nodes, edges: filteredEdges };
	}
}
