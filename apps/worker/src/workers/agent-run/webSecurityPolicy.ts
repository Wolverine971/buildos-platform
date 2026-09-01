// apps/worker/src/workers/agent-run/webSecurityPolicy.ts
import {
	AGENT_OP_WEB_READ_CATALOG,
	AGENT_OP_WEB_SEARCH,
	defaultAllowedOpsForMode
} from '@buildos/shared-agent-ops';

function isWebOp(op: string): boolean {
	return AGENT_OP_WEB_READ_CATALOG.some((webOp) => webOp === op);
}

/**
 * Autonomous runs must be either workspace-capable or web-capable, never both.
 * This prevents workspace/private values (including same-batch reads) from
 * becoming model-authored search queries or URL-selection signals. Dedicated
 * deep-research children already use an explicit web-only allowlist.
 */
export function resolveSegregatedAgentRunAllowedOps(params: {
	mode: 'read_only' | 'read_write';
	allowedOps: string[] | null;
}): { allowedOps: string[]; webScopeRemoved: boolean } {
	const granted =
		params.allowedOps !== null
			? [...params.allowedOps]
			: [...defaultAllowedOpsForMode(params.mode), ...AGENT_OP_WEB_READ_CATALOG];
	const hasWeb = granted.some(isWebOp);
	const hasWorkspace = granted.some((op) => !isWebOp(op));

	return {
		allowedOps: hasWeb && hasWorkspace ? granted.filter((op) => !isWebOp(op)) : granted,
		webScopeRemoved: hasWeb && hasWorkspace
	};
}

/** Remove model-controlled provider knobs that can encode data or steer fetches. */
export function pinAgentRunWebSearchArgs(args: Record<string, unknown>): Record<string, unknown> {
	return {
		query: typeof args.query === 'string' ? args.query : '',
		search_depth: 'advanced',
		max_results: 4,
		include_answer: false
	};
}

export function isAgentRunWebSearch(op: string): boolean {
	return op === AGENT_OP_WEB_SEARCH;
}
