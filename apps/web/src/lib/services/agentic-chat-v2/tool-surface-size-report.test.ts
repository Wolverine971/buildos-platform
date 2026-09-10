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
		// 2026-09-08 (F28): declare_read_only_turn was retired from the acting
		// surface, leaving three controls plus the shell and its child creates.
		expect(projectCreate.toolCount).toBe(6);
		// 2026-09-04: budget bumped 2500 → 2750 (measured 2,671). create_onto_task
		// now names the five UI priority labels instead of "1 is highest, 5
		// lowest" (told only the endpoints, a model writes 1 for "high" and the
		// task renders as "P1 Critical"), points `props` at the
		// duration_minutes convention (the estimate was being written into the
		// description as prose), and says a prerequisite is a relationship rather
		// than description text. +426 chars of deliberate creation guidance for
		// weak routed models, same class as the create_onto_project bump above.
		// 2026-09-05: ef4ad9a10 added the typed, nonnegative duration_minutes
		// schema (+147 chars, 2,671 -> 2,818), not more description copy.
		// 2026-09-10: work-mode taxonomy and explicit calendar opt-in guidance
		// add 238 chars (2,818 -> 3,056). Keep 44 chars of headroom; the full
		// surface caps below still hold without increasing their budgets.
		expect(createTask?.chars).toBeLessThanOrEqual(3100);
	});

	it('retains the reviewed estimate and relationship capabilities behind the size budgets', () => {
		const tools = getGatewaySurfaceForProfile('project');
		const names = tools.map((tool) => tool.function?.name);
		expect(names).toContain('get_onto_document_details');
		expect(names).toContain('link_onto_entities');
		for (const name of ['create_onto_task', 'update_onto_task']) {
			const tool = tools.find((candidate) => candidate.function?.name === name);
			expect(tool?.function?.parameters.properties.props).toMatchObject({
				type: 'object',
				properties: { duration_minutes: { type: 'number', minimum: 0 } }
			});
			expect(tool?.function?.parameters.properties.calendar_sync).toMatchObject({
				default: 'none',
				enum: ['auto', 'none']
			});
		}
		const contract = tools.find((tool) => tool.function?.name === 'declare_turn_contract');
		expect(contract?.function?.parameters.properties.outcomes).toMatchObject({
			type: 'array',
			items: {
				properties: {
					src_label: { type: ['string', 'null'], pattern: '^[a-z0-9][a-z0-9_-]{0,39}$' },
					dst_label: { type: ['string', 'null'], pattern: '^[a-z0-9][a-z0-9_-]{0,39}$' }
				}
			}
		});
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
		// Bumped 2026-09-04: 32,000 → 40,000. Measured 37,995 after mounting
		// create_onto_project on the global surface (+6,028 for the catalog
		// definition; the worker's reviewed rewrite the model actually sees is
		// ~2.2k) plus the control-tool and schedule-field description work. A
		// General Chat "create a project" turn was a dead turn before this.
		expect(global?.totalChars).toBeLessThanOrEqual(40_000);
		// Reviewed 2026-09-05 against the previous signed snapshot: +838 for
		// contract reference/null handling, +321 for typed task estimates, +396
		// for get_onto_document_details, +1,190 for link_onto_entities. These
		// committed capabilities explain all 2,745 chars (38,833 -> 41,578).
		// Do not remove capabilities to fit the old surface or relax other caps.
		expect(project?.totalChars).toBeLessThanOrEqual(42_000);
		// Bumped 2026-09-04: 15,250 → 15,700. Measured 15,458 — +426 from the
		// create_onto_task description work noted above, and +516 already present
		// on this branch from the control-tool descriptions (declare_turn_contract).
		// Same reviewed changes: +838 contract, +147 task = 16,443 chars;
		// the project-create surface still has exactly the same seven tools.
		expect(projectCreate?.totalChars).toBeLessThanOrEqual(16_600);
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
