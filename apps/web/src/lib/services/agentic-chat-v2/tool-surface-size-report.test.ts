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

		expect(createProject?.chars).toBeLessThanOrEqual(5000);
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
		expect(projectBasic?.totalChars).toBeLessThanOrEqual(9000);
		expect(projectWrite?.totalChars).toBeLessThan(21000);
	});
});
