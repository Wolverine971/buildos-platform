// apps/web/src/lib/services/agentic-chat-v2/living-workspace-tools.test.ts
//
// Carried over from the deleted tool-selector.test.ts (stage S6, 2026-09-04).
// The message-shape cases collapsed into one: message text is no longer an
// input, so no wording can change the outcome.
import { describe, expect, it } from 'vitest';
import { getGatewaySurfaceForProfile } from '@buildos/agentic-chat-runtime/catalog';
import { applyLivingWorkspaceToolProfile } from './living-workspace-tools';

const FICTION_WORKSPACE = {
	mode: 'living_reference',
	domain_profile: 'fiction_story',
	domain_affinity: 'writing.fiction'
} as const;

function names(tools: { function?: { name?: string } }[]): string[] {
	return tools.map((tool) => tool.function?.name).filter((name): name is string => Boolean(name));
}

describe('applyLivingWorkspaceToolProfile', () => {
	it('leaves a non-living-reference project surface untouched', () => {
		const tools = getGatewaySurfaceForProfile('project');
		const selection = applyLivingWorkspaceToolProfile({ tools, workspace: null });

		expect(selection.tools).toBe(tools);
		expect(selection.implicitCapture).toBe(false);
		expect(selection.commissionedWriteMinimumCount).toBe(0);
	});

	it('mounts the document write pair for a living-reference project', () => {
		// A surface that has not already got them: project_create is the only
		// launch surface without document writes.
		const tools = getGatewaySurfaceForProfile('project_create');
		const selection = applyLivingWorkspaceToolProfile({
			tools,
			workspace: FICTION_WORKSPACE
		});

		expect(names(selection.tools)).toEqual(
			expect.arrayContaining(['create_onto_document', 'update_onto_document'])
		);
		// Whether this message commissions a capture is the semantic disposition
		// gate's call, never this function's.
		expect(selection.implicitCapture).toBe(false);
		expect(selection.commissionedWriteMinimumCount).toBe(0);
	});

	it('adds nothing when the project surface already carries the pair', () => {
		const tools = getGatewaySurfaceForProfile('project');
		const selection = applyLivingWorkspaceToolProfile({
			tools,
			workspace: FICTION_WORKSPACE
		});

		expect(names(selection.tools)).toEqual(names(tools));
	});
});
