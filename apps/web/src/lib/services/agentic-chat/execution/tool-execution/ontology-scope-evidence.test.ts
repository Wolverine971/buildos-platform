// apps/web/src/lib/services/agentic-chat/execution/tool-execution/ontology-scope-evidence.test.ts
import { describe, expect, it } from 'vitest';
import { extractOntologyScopeEvidence } from './ontology-scope-evidence';

const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
const otherProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
const goalId = 'b4724346-2b1b-4e71-a9c8-1e25f1aa9b8e';
const taskId = 'e1038564-6e3e-4e18-aa0a-a460fd2e3f80';

describe('ontology scope evidence', () => {
	it('extracts exact detail ownership from the returned entity record', () => {
		expect(
			extractOntologyScopeEvidence({
				toolName: 'get_onto_goal_details',
				args: { goal_id: goalId },
				result: { goal: { id: goalId, project_id: projectId } }
			})
		).toEqual([{ kind: 'goal', entityId: goalId, projectId }]);
	});

	it('does not trust a detail result whose id differs from the requested id', () => {
		expect(
			extractOntologyScopeEvidence({
				toolName: 'get_onto_goal_details',
				args: { goal_id: goalId },
				result: {
					goal: { id: taskId, project_id: projectId }
				}
			})
		).toEqual([]);
	});

	it('does not infer detail ownership from the current project when the result omits it', () => {
		expect(
			extractOntologyScopeEvidence({
				toolName: 'get_onto_goal_details',
				args: { goal_id: goalId, project_id: projectId },
				result: { goal: { id: goalId } }
			})
		).toEqual([]);
	});

	it('extracts typed search results with their explicit project ownership', () => {
		expect(
			extractOntologyScopeEvidence({
				toolName: 'search_ontology',
				args: { query: 'validate demand' },
				result: {
					results: [
						{ type: 'goal', id: goalId, project_id: projectId },
						{ type: 'task', id: taskId, project_id: otherProjectId }
					]
				}
			})
		).toEqual([
			{ kind: 'goal', entityId: goalId, projectId },
			{ kind: 'task', entityId: taskId, projectId: otherProjectId }
		]);
	});

	it('extracts all project-detail collections using the trusted project request', () => {
		expect(
			extractOntologyScopeEvidence({
				toolName: 'get_onto_project_details',
				args: { project_id: projectId },
				result: {
					project: { id: projectId, name: 'Launch' },
					goals: [{ id: goalId, project_id: projectId }],
					tasks: [{ id: taskId, project_id: projectId }]
				}
			})
		).toEqual([
			{ kind: 'project', entityId: projectId, projectId },
			{ kind: 'task', entityId: taskId, projectId },
			{ kind: 'goal', entityId: goalId, projectId }
		]);
	});

	it('extracts child ownership from a full project graph', () => {
		const requirementId = 'dc4a9f82-4a9a-4614-96e8-31d25d683d08';
		expect(
			extractOntologyScopeEvidence({
				toolName: 'get_onto_project_graph',
				args: { project_id: projectId },
				result: {
					graph: {
						project: { id: projectId, name: 'Launch' },
						goals: [{ id: goalId, project_id: projectId }],
						requirements: [{ id: requirementId, project_id: projectId }]
					}
				}
			})
		).toEqual([
			{ kind: 'project', entityId: projectId, projectId },
			{ kind: 'goal', entityId: goalId, projectId },
			{ kind: 'requirement', entityId: requirementId, projectId }
		]);
	});

	it('rejects a project payload whose explicit envelope contradicts the request', () => {
		expect(
			extractOntologyScopeEvidence({
				toolName: 'get_onto_project_details',
				args: { project_id: projectId },
				result: {
					project: { id: otherProjectId, name: 'Wrong project' },
					goals: [{ id: goalId, project_id: otherProjectId }]
				}
			})
		).toEqual([]);
	});

	it('extracts the typed next milestone from each workspace project summary', () => {
		const milestoneId = '7d960009-cf2f-4506-b75f-08ff17621ca3';
		expect(
			extractOntologyScopeEvidence({
				toolName: 'get_workspace_overview',
				args: {},
				result: {
					projects: [
						{
							project_id: projectId,
							name: 'Launch',
							next_milestone: { id: milestoneId, title: 'Ship' }
						}
					]
				}
			})
		).toEqual([
			{ kind: 'project', entityId: projectId, projectId },
			{ kind: 'milestone', entityId: milestoneId, projectId }
		]);
	});

	it('ignores not-found payloads and untrusted tool output', () => {
		expect(
			extractOntologyScopeEvidence({
				toolName: 'get_onto_goal_details',
				args: { goal_id: goalId },
				result: { status: 'not_found', found: false, goal: null }
			})
		).toEqual([]);
		expect(
			extractOntologyScopeEvidence({
				toolName: 'web_search',
				args: {},
				result: { goal: { id: goalId, project_id: projectId } }
			})
		).toEqual([]);
	});

	it('retains document ownership when a loaded section anchor is not found', () => {
		const documentId = 'c16bbfc1-c8f6-433f-9d84-f7ed17861757';
		expect(
			extractOntologyScopeEvidence({
				toolName: 'read_document_section',
				args: { document_id: documentId, anchor: 'missing' },
				result: {
					document_id: documentId,
					project_id: projectId,
					found: false,
					available_anchors: ['overview']
				}
			})
		).toEqual([{ kind: 'document', entityId: documentId, projectId }]);
	});
});
