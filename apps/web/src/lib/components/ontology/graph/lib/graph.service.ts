// apps/web/src/lib/components/ontology/graph/lib/graph.service.ts
import type {
	CytoscapeEdge,
	CytoscapeNode,
	GraphData,
	GraphSourceData,
	OntoDocument,
	OntoEdge,
	OntoOutput,
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
		return tasks.map((task) => ({
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
					planId: task.plan_id,
					props: task.props
				},
				color: task.state_key === 'done' ? '#10b981' : '#f59e0b',
				size: 25,
				shape: 'ellipse'
			}
		}));
	}

	static outputsToNodes(outputs: OntoOutput[]): CytoscapeNode[] {
		return outputs.map((output) => ({
			data: {
				id: output.id,
				label: output.name,
				type: 'output',
				metadata: {
					projectId: output.project_id,
					typeKey: output.type_key,
					state: output.state_key,
					stage: output.facet_stage,
					props: output.props
				},
				color: '#8b5cf6',
				size: 30,
				shape: 'diamond'
			}
		}));
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

				return {
					data: {
						id: edge.id,
						source: edge.src_id,
						target: edge.dst_id,
						label: edge.rel,
						relationship: edge.rel,
						strength: weight
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
				const allowedKinds = new Set(['project', 'task', 'output', 'document']);
				nodes = [
					...this.projectsToNodes(data.projects),
					...this.tasksToNodes(data.tasks),
					...this.outputsToNodes(data.outputs),
					...this.documentsToNodes(data.documents)
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
					...this.documentsToNodes(data.documents)
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
