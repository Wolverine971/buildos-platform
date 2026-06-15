// apps/web/src/lib/services/agentic-chat/tools/skills/skill-related-ops-integrity.test.ts
//
// Referential-integrity guard for skill "Related Tools" sections.
//
// A skill's relatedOps are resolved to callable tool names via the tool registry
// (skill-load.ts `resolveRelatedOpToolNames`). An op that does not resolve is
// silently dropped from `materialized_tools`, so the agent can see a tool
// reference it cannot invoke. This test fails fast on any such dead op.
//
// Caught BUG-4 (2026-06-15): google_calendar listed `google_calendar.*` ops (real
// ops are `cal.event.*`) and libri_knowledge listed tool names as ops.
import { describe, expect, it } from 'vitest';
import { listAllSkills } from './registry';
import { getToolRegistry } from '../registry/tool-registry';
import { normalizeGatewayOpName } from '../registry/gateway-op-aliases';

describe('skill relatedOps integrity', () => {
	it('every registered skill relatedOp resolves to a callable tool in the registry', () => {
		const registry = getToolRegistry();
		const deadOps: string[] = [];

		for (const skill of listAllSkills()) {
			for (const op of skill.relatedOps) {
				const normalized = normalizeGatewayOpName(op);
				if (!registry.ops[normalized]?.tool_name) {
					deadOps.push(`${skill.id} -> ${op}`);
				}
			}
		}

		expect(deadOps).toEqual([]);
	});
});
