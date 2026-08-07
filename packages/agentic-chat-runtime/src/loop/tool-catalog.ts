// packages/agentic-chat-runtime/src/loop/tool-catalog.ts
//
// Injected tool-catalog port (Slice 18 S2). The legacy loop resolved tool
// identity through web's `getToolRegistry()` singleton, whose construction
// pulls the host-only definitions closure (email/libri feature gates). The
// loop only ever reads two lookup tables, so the port is exactly that shape:
// each host installs a provider once at composition time — web installs the
// real registry from its shims, the worker installs its allowlisted surface
// (S4) — and classification stays synchronous. A missing installation is a
// composition defect and throws; a silently empty catalog would let every
// tool fall through to name heuristics and drift classification unrefereed.

export type AgenticChatLoopCatalogOpV1 = {
	op: string;
	tool_name: string;
	kind: 'read' | 'write';
	parameters_schema?: Record<string, unknown>;
};

export type AgenticChatLoopToolCatalogV1 = {
	ops: Readonly<Record<string, AgenticChatLoopCatalogOpV1>>;
	byToolName: Readonly<Record<string, AgenticChatLoopCatalogOpV1>>;
};

let catalogProvider: (() => AgenticChatLoopToolCatalogV1) | null = null;

export function provideAgenticChatLoopToolCatalog(
	provider: () => AgenticChatLoopToolCatalogV1
): void {
	catalogProvider = provider;
}

export function getAgenticChatLoopToolCatalog(): AgenticChatLoopToolCatalogV1 {
	if (!catalogProvider) {
		throw new Error(
			'Agentic Chat loop tool catalog is not installed. The host must call provideAgenticChatLoopToolCatalog during composition before loop classification runs.'
		);
	}
	return catalogProvider();
}
