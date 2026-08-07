// packages/agentic-chat-runtime/src/loop/skill-lookup.ts
//
// Injected skill-lookup port (Slice 18 S2d). Repair instructions only need to
// canonicalize a skill reference to its id and walk parent chains; the full
// skills catalog stays host-side because its definitions load markdown through
// Vite `?raw` imports, which neither tsup nor the worker's tsc build resolve
// (recorded S3 premise correction). Same install contract as the tool catalog:
// hosts install once at composition, and a missing installation throws.

export type SkillLoadFormat = 'short' | 'full';

export type AgenticChatLoopSkillLookupV1 = {
	/** Resolve a model-supplied skill reference (id, legacy path, alias) to its canonical id. */
	getSkillIdByReference(reference: string): string | null;
	/** Canonical parent id of a skill, or null at the root / for unknown ids. */
	getSkillParentId(skillId: string): string | null;
};

let skillLookupProvider: (() => AgenticChatLoopSkillLookupV1) | null = null;

export function provideAgenticChatLoopSkillLookup(
	provider: () => AgenticChatLoopSkillLookupV1
): void {
	skillLookupProvider = provider;
}

export function getAgenticChatLoopSkillLookup(): AgenticChatLoopSkillLookupV1 {
	if (!skillLookupProvider) {
		throw new Error(
			'Agentic Chat loop skill lookup is not installed. The host must call provideAgenticChatLoopSkillLookup during composition before repair instructions run.'
		);
	}
	return skillLookupProvider();
}
