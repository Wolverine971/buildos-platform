// apps/web/src/lib/components/ontology/graph/lib/graph.service.ts
import type {
	CytoscapeEdge,
	CytoscapeNode,
	GraphData,
	GraphSourceData,
	OntoDocument,
	OntoEdge,
	OntoGoal,
	OntoMilestone,
	OntoOutput,
	OntoPlan,
	OntoProject,
	OntoTask,
	OntoTemplate,
	ViewMode
} from './graph.types';

/**
 * Transform ontology entities into Cytoscape-friendly payloads with consistent styling.
 */
export class OntologyGraphService {
	static templatesToNodes(templates: OntoTemplate[]): CytoscapeNode[] {
		return templates.map((template) => ({
			data: {
				id: template.id,
				label: template.name,
				type: 'template',
				parent: template.parent_template_id ?? undefined,
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
				shape: template.parent_template_id ? 'ellipse' : 'hexagon',
				size: 40
			}
		}));
	}

	static projectsToNodes(projects: OntoProject[]): CytoscapeNode[] {
		return projects.map((project) => {
			const stateColors: Record<string, string> = {
				draft: '#9ca3af',
				active: '#10b981',
				complete: '#3b82f6',
				archived: '#6b7280'
			};

			const scaleToSize: Record<string, number> = {
				micro: 30,
				small: 35,
				medium: 40,
				large: 50,
				epic: 60
			};

			return {
				data: {
					id: project.id,
					label: project.name,
					type: 'project',
					metadata: {
						description: project.description,
						typeKey: project.type_key,
						state: project.state_key,
						context: project.facet_context,
						scale: project.facet_scale,
						stage: project.facet_stage,
						startAt: (project as any).start_at,
						endAt: (project as any).end_at,
						createdBy: project.created_by,
						props: project.props
					},
					color: stateColors[project.state_key] ?? '#9ca3af',
					size: scaleToSize[project.facet_scale ?? 'medium'] ?? 40,
					shape: 'roundrectangle'
				}
			};
		});
	}

	static tasksToNodes(tasks: OntoTask[]): CytoscapeNode[] {
		return tasks.map((task) => {
			// Match project page task colors: done=emerald, in_progress=amber, default=gray
			const stateColors: Record<string, string> = {
				done: '#10b981', // emerald-500
				completed: '#10b981',
				complete: '#10b981',
				in_progress: '#f59e0b', // amber-500
				active: '#f59e0b',
				todo: '#6b7280', // gray-500
				draft: '#6b7280'
			};
			const color = stateColors[task.state_key ?? 'todo'] ?? '#6b7280';

			return {
				data: {
					id: task.id,
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
					color,
					size: 25,
					shape: 'ellipse'
				}
			};
		});
	}

	static outputsToNodes(outputs: OntoOutput[]): CytoscapeNode[] {
		return outputs.map((output) => {
			// Match project page output primitive colors
			// document=blue, event=purple, collection=amber, external=emerald
			const primitiveColors: Record<string, string> = {
				document: '#3b82f6', // blue-500
				event: '#8b5cf6', // purple-500
				collection: '#f59e0b', // amber-500
				external: '#10b981' // emerald-500
			};

			// Extract primitive from type_key (e.g., "output.document.report" -> "document")
			const parts = (output.type_key ?? '').split('.');
			const primitive = parts[1] ?? 'document';
			const color = primitiveColors[primitive] ?? '#8b5cf6';

			return {
				data: {
					id: output.id,
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
					color,
					size: 30,
					shape: 'diamond'
				}
			};
		});
	}

	static documentsToNodes(documents: OntoDocument[]): CytoscapeNode[] {
		return documents.map((document) => ({
			data: {
				id: document.id,
				label: document.title,
				type: 'document',
				metadata: {
					projectId: document.project_id,
					typeKey: document.type_key,
					state: document.state_key,
					props: document.props
				},
				color: '#06b6d4',
				size: 25,
				shape: 'rectangle'
			}
		}));
	}

	static plansToNodes(plans: OntoPlan[]): CytoscapeNode[] {
		// Plans use Calendar icon on project page - use a blue-ish purple
		const stateColors: Record<string, string> = {
			draft: '#94a3b8', // slate-400
			active: '#6366f1', // indigo-500
			complete: '#4f46e5', // indigo-600
			archived: '#6b7280' // gray-500
		};

		return plans.map((plan) => ({
			data: {
				id: plan.id,
				label: plan.name,
				type: 'plan',
				metadata: {
					projectId: plan.project_id,
					typeKey: plan.type_key,
					state: plan.state_key,
					props: plan.props
				},
				color: stateColors[plan.state_key ?? 'draft'] ?? '#6366f1',
				size: 35,
				shape: 'round-rectangle'
			}
		}));
	}

	static goalsToNodes(goals: OntoGoal[]): CytoscapeNode[] {
		return goals.map((goal) => ({
			data: {
				id: goal.id,
				label: goal.name,
				type: 'goal',
				metadata: {
					projectId: goal.project_id,
					typeKey: goal.type_key,
					props: goal.props
				},
				color: '#f59e0b', // amber-500 - matches Target icon on project page
				size: 40,
				shape: 'star'
			}
		}));
	}

	static milestonesToNodes(milestones: OntoMilestone[]): CytoscapeNode[] {
		return milestones.map((milestone) => ({
			data: {
				id: milestone.id,
				label: milestone.title,
				type: 'milestone',
				metadata: {
					projectId: milestone.project_id,
					dueAt: milestone.due_at,
					props: milestone.props
				},
				color: '#10b981', // emerald-500 - matches Flag icon on project page
				size: 32,
				shape: 'triangle' // Triangle for milestones (like a flag)
			}
		}));
	}

	/**
	 * Get edge styling based on relationship type
	 * Colors match the project page icon colors for consistency
	 */
	static getEdgeStyle(rel: string): { color: string; width: number } {
		const styles: Record<string, { color: string; width: number }> = {
			// Hierarchical relationships (gray)
			belongs_to_plan: { color: '#6b7280', width: 2 },
			has_task: { color: '#6b7280', width: 2 },
			contains: { color: '#6b7280', width: 2 },
			has_plan: { color: '#6b7280', width: 2 },
			// Goal support relationships (amber - matches Target icon)
			supports_goal: { color: '#f59e0b', width: 3 },
			requires: { color: '#f59e0b', width: 3 },
			achieved_by: { color: '#f59e0b', width: 3 },
			has_goal: { color: '#f59e0b', width: 2 },
			// Dependency relationships (orange/red for warning)
			depends_on: { color: '#f97316', width: 2 },
			blocks: { color: '#ef4444', width: 2 },
			// Temporal/milestone relationships (emerald - matches Flag icon)
			targets_milestone: { color: '#10b981', width: 2 },
			has_milestone: { color: '#10b981', width: 2 },
			// Knowledge/document relationships (blue - matches FileText icon)
			references: { color: '#3b82f6', width: 1 },
			referenced_by: { color: '#3b82f6', width: 1 },
			has_document: { color: '#3b82f6', width: 1 },
			has_context_document: { color: '#3b82f6', width: 2 },
			// Production/output relationships (purple - matches Layers icon default)
			produces: { color: '#8b5cf6', width: 2 },
			produced_by: { color: '#8b5cf6', width: 2 },
			has_output: { color: '#8b5cf6', width: 2 }
		};
		return styles[rel] ?? { color: '#9ca3af', width: 1 };
	}

	static edgesToCytoscape(edges: OntoEdge[]): CytoscapeEdge[] {
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

				const style = this.getEdgeStyle(edge.rel);

				return {
					data: {
						id: edge.id,
						source: edge.src_id,
						target: edge.dst_id,
						label: edge.rel,
						relationship: edge.rel,
						strength: weight,
						color: style.color,
						width: style.width
					}
				};
			});
	}

	static buildGraphData(data: GraphSourceData, viewMode: ViewMode): GraphData {
		let nodes: CytoscapeNode[] = [];
		let edges: CytoscapeEdge[] = [];

		switch (viewMode) {
			case 'templates': {
				nodes = this.templatesToNodes(data.templates);
				const templateEdges = data.edges.filter(
					(edge) => edge.src_kind === 'template' && edge.dst_kind === 'template'
				);
				edges = this.edgesToCytoscape(templateEdges);
				break;
			}
			case 'projects': {
				// Include all project-related entity types
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
				edges = this.edgesToCytoscape(projectEdges);
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
				edges = this.edgesToCytoscape(data.edges);
				break;
			}
		}

		const nodeIds = new Set(nodes.map((node) => node.data.id));
		const filteredEdges = edges.filter(
			(edge) => nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target)
		);

		return { nodes, edges: filteredEdges };
	}
}
