// apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile
} from '@buildos/agentic-chat-runtime/catalog';
import {
	buildCanonicalToolSurfaceSizeReports,
	buildGatewayProfileToolSurfaceSizeReports,
	buildSkillToolBundleSizeReports,
	buildToolSurfaceSizeReport,
	formatToolSurfaceSizeMatrix,
	formatToolSurfaceSizeReport
} from './tool-surface-size-report';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('tool surface size report', () => {
	it('measures the current tool payload by tool and total provider definition size', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const tools = getGatewaySurfaceForContextType('project');
		const report = buildToolSurfaceSizeReport({
			profile: 'current_request',
			contextType: 'project',
			tools
		});

		expect(report.profile).toBe('current_request');
		expect(report.contextType).toBe('project');
		expect(report.toolCount).toBe(tools.length);
		expect(report.totalChars).toBeGreaterThan(0);
		expect(report.estimatedTokens).toBeGreaterThan(0);
		expect(report.tools[0]?.chars).toBeGreaterThanOrEqual(report.tools.at(-1)?.chars ?? 0);
		expect(report.tools.map((tool) => tool.name)).toContain('declare_turn_contract');
		expect(report.tools.map((tool) => tool.name)).not.toContain('skill_load');
	});

	it('formats a context/profile matrix for comparing canonical surfaces', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const reports = buildCanonicalToolSurfaceSizeReports([
			'global',
			'project',
			'project_create'
		]);
		const matrix = formatToolSurfaceSizeMatrix(reports).join('\n');
		const projectReport = reports.find((report) => report.contextType === 'project');

		expect(matrix).toContain('profile | context | tools | chars | est_tokens');
		expect(matrix).toContain('canonical_gateway | global |');
		expect(matrix).toContain('canonical_gateway | project |');
		expect(projectReport?.toolCount).toBeGreaterThan(0);
		expect(formatToolSurfaceSizeReport(projectReport!, { maxTools: 3 }).join('\n')).toContain(
			'... '
		);
	});

	it('keeps the largest preloaded provider tool definitions under budget', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const projectCreate = buildToolSurfaceSizeReport({
			profile: 'project_create',
			contextType: 'project_create',
			tools: getGatewaySurfaceForProfile('project_create')
		});
		const project = buildToolSurfaceSizeReport({
			profile: 'project',
			contextType: 'project',
			tools: getGatewaySurfaceForProfile('project')
		});

		const createProject = projectCreate.tools.find(
			(tool) => tool.name === 'create_onto_project'
		);
		const createTask = project.tools.find((tool) => tool.name === 'create_onto_task');

		// 2026-04-18: budget bumped from 5000 → 5500 after adding `kind` enum
		// constraints to relationship endpoints (regression bc05e6ac fix).
		// 2026-06-26: budget bumped from 5500 → 6200. create_onto_project now spells
		// out the valid `state_key` values (planning/active/paused/completed/cancelled)
		// and the distinct `props.facets.stage` lifecycle values
		// (discovery/planning/execution/launch/maintenance/complete), plus explicit
		// guidance never to confuse the two. This is deliberate creation guidance for
		// weaker routed models, not description-bloat. Serializes to ~5772 chars; 6200
		// keeps ~428 chars of headroom.
		expect(createProject?.chars).toBeLessThanOrEqual(6200);
		// 2026-09-04 (stage S6): the two project-create profiles collapsed into
		// one — four controls plus the shell and its child creates, no discovery.
		expect(projectCreate.toolCount).toBe(7);
		expect(createTask?.chars).toBeLessThanOrEqual(2500);
	});

	it('keeps deterministic preloaded profiles below target payload sizes', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const reports = buildGatewayProfileToolSurfaceSizeReports([
			'global',
			'project',
			'project_create'
		]);
		const global = reports.find((report) => report.profile === 'global');
		const project = reports.find((report) => report.profile === 'project');
		const projectCreate = reports.find((report) => report.profile === 'project_create');

		// RE-BASELINED 2026-09-04 for the three stable surfaces (one-engine stage
		// S6). The nine profiles this replaces were partly selected by regex over
		// the user's message; a stable surface has to carry, on every turn, the
		// capabilities that used to be materialized only when a pattern matched.
		// Measured, caps at measured + ~5%:
		//   global         26 tools / 30,464 chars (was global_basic 15 / 11,760)
		//   project        33 tools / 37,331 chars (was project_write_document
		//                  20 / 21,030)
		//   project_create  7 tools / 14,516 chars (unchanged members; this is
		//                  the old project_create_minimal, renamed)
		// What global gained over global_basic: create/update/move_onto_task,
		// delegate_task (3,116), web_search + web_visit (2,873), and the five
		// calendar tools (6,373). What project gained over project_write_document:
		// the same, plus get_project_calendar / set_project_calendar, minus the
		// two cross-project searches. This is a deliberate token spend: the
		// alternative is a turn that cannot reach a capability, because the worker
		// surface is immutable once the turn is admitted.
		expect(global?.totalChars).toBeLessThanOrEqual(32_000);
		expect(project?.totalChars).toBeLessThanOrEqual(39_200);
		expect(projectCreate?.totalChars).toBeLessThanOrEqual(15_250);
	});

	it('reports complete skill bundles and fails closed on unresolved related ops', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const reports = buildSkillToolBundleSizeReports();
		const calendar = reports.find((report) => report.skillId === 'calendar_management');
		const plan = reports.find((report) => report.skillId === 'plan_management');

		expect(reports.flatMap((report) => report.unresolvedOps)).toEqual([]);
		expect(calendar).toMatchObject({
			relatedOpCount: 7,
			resolvedToolCount: 7
		});
		expect(calendar?.materializedToolNames).toContain('delete_calendar_event');
		// 2026-09-04: the project surface already carries the whole calendar
		// bundle, so loading the skill adds no schema at all; global is missing
		// only the two project-calendar binding tools.
		expect(calendar?.incrementalByProfile.project).toMatchObject({ toolCount: 0 });
		expect(calendar?.incrementalByProfile.global).toMatchObject({
			toolCount: 2,
			toolNames: ['get_project_calendar', 'set_project_calendar']
		});
		expect(calendar?.incrementalByProfile.project_create).toMatchObject({ toolCount: 7 });
		expect(plan?.estimatedTokens).toBeLessThanOrEqual(4_500);
		expect(Math.max(...reports.map((report) => report.estimatedTokens))).toBeLessThanOrEqual(
			4_500
		);
	});
});
