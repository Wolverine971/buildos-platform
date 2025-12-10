// apps/web/src/lib/components/ontology/graph/lib/svelteflow.service.ts
import type { Node, Edge } from '@xyflow/svelte';
import type {
	GraphSourceData,
	OntoDocument,
	OntoGoal,
	OntoMilestone,
	OntoOutput,
	OntoPlan,
	OntoProject,
	OntoTask,
	OntoTemplate,
	ViewMode
} from './graph.types';

export interface SvelteFlowNodeData extends Record<string, unknown> {
	label: string;
	type: string;
	metadata?: Record<string, unknown>;
	color: string;
	state?: string;
}

export interface SvelteFlowEdgeData extends Record<string, unknown> {
	relationship: string;
	color: string;
}

export type SvelteFlowNode = Node<SvelteFlowNodeData>;
export type SvelteFlowEdge = Edge<SvelteFlowEdgeData>;

export interface SvelteFlowGraphData {
	nodes: SvelteFlowNode[];
	edges: SvelteFlowEdge[];
}

/**
 * Transform ontology entities into Svelte Flow format with custom node types.
 */
export class SvelteFlowGraphService {
	static templatesToNodes(templates: OntoTemplate[]): SvelteFlowNode[] {
		return templates.map((template, index) => ({
			id: template.id,
			type: 'template',
			position: { x: 100 + (index % 5) * 200, y: 100 + Math.floor(index / 5) * 150 },
			data: {
				label: template.name,
				type: 'template',
				metadata: {
					scope: template.scope,
					typeKey: template.type_key,
					status: template.status,
					isAbstract: template.is_abstract ?? false,
					schema: template.schema,
					defaultProps: template.default_props,
					fsm: template.fsm,
					metadata: template.metadata
				},
				color: template.is_abstract ? '#9ca3af' : '#3b82f6',
				state: template.status
			}
		}));
	}

	static projectsToNodes(projects: OntoProject[]): SvelteFlowNode[] {
		const stateColors: Record<string, string> = {
			draft: '#9ca3af',
			active: '#10b981',
			complete: '#3b82f6',
			archived: '#6b7280'
		};

		return projects.map((project, index) => ({
			id: project.id,
			type: 'project',
			position: { x: 150 + (index % 4) * 250, y: 200 + Math.floor(index / 4) * 180 },
			data: {
				label: project.name,
				type: 'project',
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
				color: stateColors[project.state_key] ?? '#9ca3af',
				state: project.state_key
			}
		}));
	}

	static tasksToNodes(tasks: OntoTask[]): SvelteFlowNode[] {
		const stateColors: Record<string, string> = {
			done: '#10b981',
			completed: '#10b981',
			complete: '#10b981',
			in_progress: '#f59e0b',
			active: '#f59e0b',
			todo: '#6b7280',
			draft: '#6b7280'
		};

		return tasks.map((task, index) => ({
			id: task.id,
			type: 'task',
			position: { x: 200 + (index % 6) * 180, y: 400 + Math.floor(index / 6) * 120 },
			data: {
				label: task.title,
				type: 'task',
				metadata: {
					projectId: task.project_id,
					state: task.state_key,
					priority: task.priority,
					dueAt: task.due_at,
					scale: task.facet_scale,
					props: task.props
				},
				color: stateColors[task.state_key ?? 'todo'] ?? '#6b7280',
				state: task.state_key ?? 'todo'
			}
		}));
	}

	static outputsToNodes(outputs: OntoOutput[]): SvelteFlowNode[] {
		const primitiveColors: Record<string, string> = {
			document: '#3b82f6',
			event: '#8b5cf6',
			collection: '#f59e0b',
			external: '#10b981'
		};

		return outputs.map((output, index) => {
			const parts = (output.type_key ?? '').split('.');
			const primitive = parts[1] ?? 'document';

			return {
				id: output.id,
				type: 'output',
				position: { x: 250 + (index % 5) * 200, y: 600 + Math.floor(index / 5) * 140 },
				data: {
					label: output.name,
					type: 'output',
					metadata: {
						projectId: output.project_id,
						typeKey: output.type_key,
						state: output.state_key,
						stage: output.facet_stage,
						primitive,
						props: output.props
					},
					color: primitiveColors[primitive] ?? '#8b5cf6',
					state: output.state_key
				}
			};
		});
	}

	static documentsToNodes(documents: OntoDocument[]): SvelteFlowNode[] {
		return documents.map((document, index) => ({
			id: document.id,
			type: 'document',
			position: { x: 300 + (index % 5) * 180, y: 750 + Math.floor(index / 5) * 120 },
			data: {
				label: document.title,
				type: 'document',
				metadata: {
					projectId: document.project_id,
					typeKey: document.type_key,
					state: document.state_key,
					props: document.props
				},
				color: '#06b6d4',
				state: document.state_key
			}
		}));
	}

	static plansToNodes(plans: OntoPlan[]): SvelteFlowNode[] {
		const stateColors: Record<string, string> = {
			draft: '#94a3b8',
			active: '#6366f1',
			complete: '#4f46e5',
			archived: '#6b7280'
		};

		return plans.map((plan, index) => ({
			id: plan.id,
			type: 'plan',
			position: { x: 350 + (index % 4) * 220, y: 300 + Math.floor(index / 4) * 160 },
			data: {
				label: plan.name,
				type: 'plan',
				metadata: {
					projectId: plan.project_id,
					typeKey: plan.type_key,
					state: plan.state_key,
					props: plan.props
				},
				color: stateColors[plan.state_key ?? 'draft'] ?? '#6366f1',
				state: plan.state_key ?? 'draft'
			}
		}));
	}

	static goalsToNodes(goals: OntoGoal[]): SvelteFlowNode[] {
		return goals.map((goal, index) => ({
			id: goal.id,
			type: 'goal',
			position: { x: 400 + (index % 3) * 250, y: 500 + Math.floor(index / 3) * 180 },
			data: {
				label: goal.name,
				type: 'goal',
				metadata: {
					projectId: goal.project_id,
					typeKey: goal.type_key,
					props: goal.props
				},
				color: '#f59e0b',
				state: undefined
			}
		}));
	}

	static milestonesToNodes(milestones: OntoMilestone[]): SvelteFlowNode[] {
		return milestones.map((milestone, index) => ({
			id: milestone.id,
			type: 'milestone',
			position: { x: 450 + (index % 4) * 200, y: 650 + Math.floor(index / 4) * 140 },
			data: {
				label: milestone.title,
				type: 'milestone',
				metadata: {
					projectId: milestone.project_id,
					dueAt: milestone.due_at,
					props: milestone.props
				},
				color: '#10b981',
				state: undefined
			}
		}));
	}

	static getEdgeStyle(rel: string): { color: string; animated: boolean; strokeWidth: number } {
		const styles: Record<string, { color: string; animated: boolean; strokeWidth: number }> = {
			// Hierarchical relationships
			belongs_to_plan: { color: '#6b7280', animated: false, strokeWidth: 2 },
			has_task: { color: '#6b7280', animated: false, strokeWidth: 2 },
			contains: { color: '#6b7280', animated: false, strokeWidth: 2 },
			has_plan: { color: '#6b7280', animated: false, strokeWidth: 2 },
			// Goal support relationships
			supports_goal: { color: '#f59e0b', animated: true, strokeWidth: 3 },
			requires: { color: '#f59e0b', animated: true, strokeWidth: 3 },
			achieved_by: { color: '#f59e0b', animated: true, strokeWidth: 3 },
			has_goal: { color: '#f59e0b', animated: false, strokeWidth: 2 },
			// Dependency relationships
			depends_on: { color: '#f97316', animated: true, strokeWidth: 2 },
			blocks: { color: '#ef4444', animated: true, strokeWidth: 2 },
			// Temporal/milestone relationships
			targets_milestone: { color: '#10b981', animated: false, strokeWidth: 2 },
			has_milestone: { color: '#10b981', animated: false, strokeWidth: 2 },
			// Knowledge/document relationships
			references: { color: '#3b82f6', animated: false, strokeWidth: 1 },
			referenced_by: { color: '#3b82f6', animated: false, strokeWidth: 1 },
			has_document: { color: '#3b82f6', animated: false, strokeWidth: 1 },
			has_context_document: { color: '#3b82f6', animated: false, strokeWidth: 2 },
			// Production/output relationships
			produces: { color: '#8b5cf6', animated: false, strokeWidth: 2 },
			produced_by: { color: '#8b5cf6', animated: false, strokeWidth: 2 },
			has_output: { color: '#8b5cf6', animated: false, strokeWidth: 2 }
		};
		return styles[rel] ?? { color: '#9ca3af', animated: false, strokeWidth: 1 };
	}

	static edgesToSvelteFlow(
		edges: { id: string; src_id: string; dst_id: string; rel: string }[]
	): SvelteFlowEdge[] {
		return edges
			.filter((edge) => edge.src_id && edge.dst_id && edge.src_id !== edge.dst_id)
			.map((edge) => {
				const style = this.getEdgeStyle(edge.rel);
				const edgeObj = {
					id: edge.id,
					source: edge.src_id,
					target: edge.dst_id,
					type: 'smoothstep',
					animated: style.animated,
					style: {
						stroke: style.color,
						strokeWidth: style.strokeWidth
					},
					data: {
						relationship: edge.rel,
						color: style.color
					}
				};
				return edgeObj as unknown as SvelteFlowEdge;
			});
	}

	static buildGraphData(data: GraphSourceData, viewMode: ViewMode): SvelteFlowGraphData {
		let nodes: SvelteFlowNode[] = [];
		let edges: SvelteFlowEdge[] = [];

		switch (viewMode) {
			case 'templates': {
				nodes = this.templatesToNodes(data.templates);
				const templateEdges = data.edges.filter(
					(edge) => edge.src_kind === 'template' && edge.dst_kind === 'template'
				);
				edges = this.edgesToSvelteFlow(templateEdges);
				break;
			}
			case 'projects': {
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
				const projectEdges = data.edges.filter(
					(edge) => allowedKinds.has(edge.src_kind) && allowedKinds.has(edge.dst_kind)
				);
				edges = this.edgesToSvelteFlow(projectEdges);
				break;
			}
			case 'full':
			default: {
				nodes = [
					...this.templatesToNodes(data.templates),
					...this.projectsToNodes(data.projects),
					...this.tasksToNodes(data.tasks),
					...this.outputsToNodes(data.outputs),
					...this.documentsToNodes(data.documents),
					...this.plansToNodes(data.plans),
					...this.goalsToNodes(data.goals),
					...this.milestonesToNodes(data.milestones)
				];
				edges = this.edgesToSvelteFlow(data.edges);
				break;
			}
		}

		// Filter edges to only include those connecting existing nodes
		const nodeIds = new Set(nodes.map((node) => node.id));
		const filteredEdges = edges.filter(
			(edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
		);

		return { nodes, edges: filteredEdges };
	}
}
