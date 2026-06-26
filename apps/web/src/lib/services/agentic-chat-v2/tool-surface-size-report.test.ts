// apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile
} from '$lib/services/agentic-chat/tools/core/gateway-surface';
import {
	buildCanonicalToolSurfaceSizeReports,
	buildGatewayProfileToolSurfaceSizeReports,
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
		expect(report.tools.map((tool) => tool.name)).toContain('skill_load');
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
		expect(createTask?.chars).toBeLessThanOrEqual(2500);
	});

	it('keeps deterministic preloaded profiles below target payload sizes', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const reports = buildGatewayProfileToolSurfaceSizeReports([
			'project_create_minimal',
			'project_basic',
			'project_write'
		]);
		const projectCreate = reports.find((report) => report.profile === 'project_create_minimal');
		const projectBasic = reports.find((report) => report.profile === 'project_basic');
		const projectWrite = reports.find((report) => report.profile === 'project_write');

		expect(projectCreate?.totalChars).toBeLessThanOrEqual(9000);
		// 2026-05-17: budget bumped from 9300 -> 9400 after adding the
		// skill_search discovery bridge. domain_load is still materialized only
		// after search, so the always-on increase stays bounded.
		// 2026-05-29: budget bumped from 9400 -> 11000. The gateway tool refactor
		// intentionally widened the always-on project_basic surface to 14 tools:
		// the discovery bridge (domain_search, skill_search, skill_load,
		// skill_reference_load, tool_search, tool_schema) plus the Corsair MCP
		// bridge (list_corsair_mcp_tools + call_corsair_mcp_tool, ~1100 chars) and
		// the project read tools. It now serializes to ~10617 chars. This is a
		// deliberate composition, not description-bloat -- verified per-tool, no
		// single definition regressed. 11000 keeps the guard meaningful (~400 chars
		// of headroom) while no longer flagging the intended surface.
		// 2026-06-16: budget bumped from 11000 -> 12000. Project Knowledge Layer (L2)
		// ungates the two lean document-retrieval tools (get_document_outline +
		// read_document_section, ~1067 chars) on every project turn so the
		// scan->read flow works without a discovery round. The full-body
		// get_onto_document_details was intentionally NOT added here. Serializes to
		// ~11684 chars; 12000 keeps ~300 chars of headroom.
		// 2026-06-19: budget bumped from 12000 -> 16000. Agent Work (Phase 4) added the
		// two orchestrator tools delegate_task + commit_change_set to project_basic
		// (deliberate composition, not description-bloat). Surface serializes to ~15482
		// chars; 16000 keeps ~500 chars of headroom. (Unrelated to the search work in the
		// same changeset; bumped here because the guard was already stale on main.)
		expect(projectBasic?.totalChars).toBeLessThanOrEqual(16000);
		// 2026-06-19: budget bumped from 21000 -> 25000. project_write extends
		// project_basic, so the same Agent Work additions (delegate_task +
		// commit_change_set) cascade here. Serializes to ~23710 chars; 25000 keeps
		// ~1290 chars of headroom. (Pre-existing on main, unrelated to the search work.)
		expect(projectWrite?.totalChars).toBeLessThan(25000);
	});
});
