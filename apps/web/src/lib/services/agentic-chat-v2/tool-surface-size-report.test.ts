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
			profile: 'project_create_minimal',
			contextType: 'project_create_minimal',
			tools: getGatewaySurfaceForProfile('project_create_minimal')
		});
		const webProjectCreate = buildToolSurfaceSizeReport({
			profile: 'project_create_compound',
			contextType: 'project_create_compound',
			tools: getGatewaySurfaceForProfile('project_create_compound')
		});
		const projectWrite = buildToolSurfaceSizeReport({
			profile: 'project_write',
			contextType: 'project_write',
			tools: getGatewaySurfaceForProfile('project_write')
		});

		const createProject = projectCreate.tools.find(
			(tool) => tool.name === 'create_onto_project'
		);
		const createTask = projectWrite.tools.find((tool) => tool.name === 'create_onto_task');

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
		expect(webProjectCreate.toolCount).toBe(1);
		expect(webProjectCreate.totalChars).toBeLessThanOrEqual(6200);
		expect(createTask?.chars).toBeLessThanOrEqual(2500);
	});

	it('keeps deterministic preloaded profiles below target payload sizes', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const reports = buildGatewayProfileToolSurfaceSizeReports([
			'project_create_compound',
			'project_create_minimal',
			'global_basic',
			'global_write',
			'project_basic',
			'project_write',
			'project_write_document'
		]);
		const webProjectCreate = reports.find(
			(report) => report.profile === 'project_create_compound'
		);
		const projectCreate = reports.find((report) => report.profile === 'project_create_minimal');
		const globalBasic = reports.find((report) => report.profile === 'global_basic');
		const globalWrite = reports.find((report) => report.profile === 'global_write');
		const projectBasic = reports.find((report) => report.profile === 'project_basic');
		const projectWrite = reports.find((report) => report.profile === 'project_write');
		const projectWriteDocument = reports.find(
			(report) => report.profile === 'project_write_document'
		);

		// 2026-08-25 definition audit: concise descriptions and removal of unsupported
		// read arguments materially reduced every profile. These caps retain bounded
		// headroom without dropping semantic guidance that changes model behavior.
		expect(webProjectCreate?.totalChars).toBeLessThanOrEqual(6200);
		// 2026-08-28: 13,400 → 13,600. Pre-existing overage (13,555 on clean main,
		// verified with the semantic-discovery work stashed) — project_create_minimal
		// does not mount explore_project, so this is unrelated drift surfaced while
		// landing it.
		// 2026-09-02: 13,600 → 13,530 (measured 13,515; create_onto_task no longer
		// tells the model to load a skill the worker cannot call).
		expect(projectCreate?.totalChars).toBeLessThanOrEqual(13_530);
		// 2026-09-02 (turn-executor audit Decision 2): global surfaces trade
		// change_chat_context (1,177 chars) for get_document_outline +
		// read_document_section (~1,100 chars) so a global "read those docs" turn
		// cannot die on an unmounted tool. Measured 10,454.
		expect(globalBasic?.totalChars).toBeLessThanOrEqual(10_470);
		// 2026-08-28: +~1,250 on the four surfaces that now preload explore_project
		// (semantic discovery, tasker/71). Its definition serializes to ~1,207 chars
		// after a deliberate trim; the steering it carries (related-not-keyword,
		// gather-before-broad-change, exact lookups stay on search_*) is the
		// load-bearing part per the 2026-06-19 query-formulation eval.
		// 2026-09-01: 19,900 → 20,100 after Calendar reads/writes began carrying
		// exact calendar_source_id identity to avoid cross-account ambiguity.
		// 2026-09-02: every surface below lost change_chat_context (-1,177) and
		// four read descriptions stopped naming unmounted tools. Measured:
		// global_write 19,982 / project_basic 10,880 / project_write 17,942 /
		// project_write_document 19,894. Caps keep the file's tight headroom.
		expect(globalWrite?.totalChars).toBeLessThanOrEqual(20_000);
		expect(projectBasic?.totalChars).toBeLessThanOrEqual(10_900);
		expect(projectWrite?.totalChars).toBeLessThanOrEqual(17_960);
		expect(projectWriteDocument?.totalChars).toBeLessThanOrEqual(19_910);
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
		expect(calendar?.incrementalByProfile.project_write_document).toMatchObject({
			toolCount: 7
		});
		expect(calendar?.incrementalByProfile.project_calendar).toMatchObject({
			toolCount: 1,
			toolNames: ['delete_calendar_event']
		});
		expect(plan?.estimatedTokens).toBeLessThanOrEqual(4_500);
		expect(Math.max(...reports.map((report) => report.estimatedTokens))).toBeLessThanOrEqual(
			4_500
		);
	});
});
