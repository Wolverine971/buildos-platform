// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution/gateway-executor.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GATEWAY_TOOL_DEFINITIONS } from '@buildos/agentic-chat-runtime/catalog';
import { executeGatewayTool, GATEWAY_TOOL_NAMES, isGatewayToolName } from './gateway-executor';

describe('gateway executor', () => {
	it('has exactly one handler for every canonical gateway definition', () => {
		const canonicalNames = GATEWAY_TOOL_DEFINITIONS.map((tool) => tool.function.name).sort();
		expect([...GATEWAY_TOOL_NAMES].sort()).toEqual(canonicalNames);
		for (const name of canonicalNames) expect(isGatewayToolName(name)).toBe(true);
		expect(isGatewayToolName('unknown_gateway')).toBe(false);
	});

	it('returns the legacy unknown-gateway envelope', async () => {
		await expect(executeGatewayTool('unknown_gateway', {})).resolves.toEqual({
			success: false,
			error: 'Unknown gateway tool: unknown_gateway',
			errorType: 'validation_error',
			toolName: 'unknown_gateway',
			toolCallId: 'gateway'
		});
	});

	it('routes domain and outcome-card aliases through shared handlers', async () => {
		const searchDomains = vi.fn().mockReturnValue({ domains: ['writing'] });
		const loadDomain = vi.fn().mockReturnValue({ id: 'writing' });
		const searchOutcomeCards = vi.fn().mockReturnValue({ cards: ['launch'] });
		const loadOutcomeCard = vi.fn().mockReturnValue({ id: 'launch' });

		await expect(
			executeGatewayTool('domain_search', { query: 'write', limit: 3 }, { searchDomains })
		).resolves.toMatchObject({ success: true, data: { domains: ['writing'] } });
		await executeGatewayTool('domain_load', { domain_id: 'writing' }, { loadDomain });
		await executeGatewayTool(
			'work_capability_search',
			{ query: 'launch', buildos_capability: 'planning', limit: 2 },
			{ searchOutcomeCards }
		);
		await executeGatewayTool(
			'work_capability_load',
			{ work_capability: 'launch' },
			{ loadOutcomeCard }
		);

		expect(searchDomains).toHaveBeenCalledWith({ query: 'write', limit: 3 });
		expect(loadDomain).toHaveBeenCalledWith('writing');
		expect(searchOutcomeCards).toHaveBeenCalledWith({
			query: 'launch',
			domain: undefined,
			buildosCapability: 'planning',
			limit: 2
		});
		expect(loadOutcomeCard).toHaveBeenCalledWith('launch');
	});

	it('preserves resource, skill, and reference argument fallbacks', async () => {
		const loadResource = vi.fn().mockReturnValue({ id: 'brief' });
		const loadSkill = vi.fn().mockReturnValue({ id: 'calendar' });
		const loadSkillReference = vi.fn().mockReturnValue({ id: 'rules' });

		await executeGatewayTool('resource_load', { resource_id: 'brief' }, { loadResource });
		await executeGatewayTool(
			'skill_load',
			{ path: 'calendar', format: 'short', include_examples: false },
			{ loadSkill }
		);
		await executeGatewayTool(
			'skill_reference_load',
			{ id: 'calendar', module: 'calendar.rules' },
			{ loadSkillReference }
		);

		expect(loadResource).toHaveBeenCalledWith('brief');
		expect(loadSkill).toHaveBeenCalledWith('calendar', {
			format: 'short',
			include_examples: false
		});
		expect(loadSkillReference).toHaveBeenCalledWith('calendar', 'calendar.rules');
	});

	it('keeps tool discovery constrained to the chat surface', async () => {
		const searchToolRegistry = vi.fn().mockReturnValue({ tools: [] });
		const getToolSchema = vi.fn().mockReturnValue({ op: 'onto.task.update' });

		await executeGatewayTool(
			'tool_search',
			{
				query: 'update task',
				capability: 'planning',
				group: 'onto',
				kind: 'write',
				entity: 'task',
				limit: 4
			},
			{ searchToolRegistry }
		);
		await executeGatewayTool(
			'tool_schema',
			{ path: 'onto.task.update', include_examples: false, include_schema: false },
			{ getToolSchema }
		);

		expect(searchToolRegistry).toHaveBeenCalledWith({
			query: 'update task',
			capability: 'planning',
			group: 'onto',
			kind: 'write',
			entity: 'task',
			limit: 4,
			surface: 'chat'
		});
		expect(getToolSchema).toHaveBeenCalledWith('onto.task.update', {
			include_examples: false,
			include_schema: false
		});
	});
});
