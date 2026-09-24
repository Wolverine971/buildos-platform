// docs/research/jev-tool-selection-2026-09-18/surfaces.ts
// Build the tool lists the worker actually sends on an opening pass, per surface.
import {
	getGatewayEmailSurfaceToolNames,
	getGatewaySurfaceForProfile,
	materializeGatewayTools
} from '@buildos/agentic-chat-runtime/catalog';
import { reviewedWorkerProviderToolDefinitionV1 } from '../../../apps/worker/src/workers/agentic-chat/provider/tool-surface';
import type { AgenticChatTurnProviderToolV1 } from '../../../apps/worker/src/workers/agentic-chat/provider/contracts';
import { reviewedAgenticChatMutationSpecV1 } from '../../../apps/worker/src/workers/agentic-chat/mutations/tool-catalog';
import { isAgenticChatProductionReadToolNameV1 } from '../../../apps/worker/src/workers/agentic-chat/tools/execution-adapter';

export type SurfaceName = 'global' | 'project';

// Mirrors productionToolsFor(): artifact surface ∩ worker read allowlist ∪ reviewed mutations
// (production enables every reviewed mutation capability), minus the deferred contract controls.
export function workerOpeningSurface(name: SurfaceName, emailConnected = true) {
	const base = getGatewaySurfaceForProfile(name);
	const email = materializeGatewayTools(
		[],
		getGatewayEmailSurfaceToolNames(emailConnected)
	).tools;
	const tools: AgenticChatTurnProviderToolV1[] = [];
	const seen = new Set<string>();
	for (const definition of [...base, ...email] as unknown as AgenticChatTurnProviderToolV1[]) {
		const toolName = definition?.function?.name;
		if (!toolName || seen.has(toolName)) continue;
		if (
			['declare_read_only_turn', 'declare_turn_contract', 'cancel_turn_contract'].includes(
				toolName
			)
		)
			continue;
		if (
			!isAgenticChatProductionReadToolNameV1(toolName) &&
			!reviewedAgenticChatMutationSpecV1(toolName)
		)
			continue;
		const reviewed = reviewedWorkerProviderToolDefinitionV1(
			JSON.parse(JSON.stringify(definition))
		);
		if (!reviewed) continue;
		seen.add(toolName);
		tools.push(reviewed);
	}
	return tools;
}

if (process.argv[1]?.endsWith('surfaces.ts')) {
	for (const name of ['global', 'project'] as const) {
		const tools = workerOpeningSurface(name);
		const chars = JSON.stringify(tools).length;
		console.log(
			`\n${name}: ${tools.length} tools, ${chars} schema chars (~${Math.round(chars / 4)} tokens)`
		);
		for (const t of tools)
			console.log(`  ${JSON.stringify(t).length.toString().padStart(6)}  ${t.function.name}`);
	}
}
