// apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile,
	materializeGatewayTools,
	resolveGatewaySurfaceProfileForContextType,
	type GatewaySurfaceProfileName
} from '$lib/services/agentic-chat/tools/core/gateway-surface';
import {
	getAutonomousWriteToolNamesForTurnIntent,
	getWriteToolNamesForTurnIntent,
	type FastChatTurnIntent
} from './turn-intent';
import { looksLikeWebResearchTurn } from '$lib/services/agentic-chat-lite/prompt/situational-rules';
import {
	LIVING_REFERENCE_MODE,
	looksLikeLivingWorkspaceCaptureTurn,
	type AgentWorkspaceMetadata
} from '$lib/services/agentic-chat/project-domain-profiles';

const REDUNDANT_DIRECT_WRITE_DISCOVERY_TOOLS = new Set(['tool_search', 'tool_schema']);

export type LivingWorkspaceToolSelection = {
	tools: ChatToolDefinition[];
	implicitCapture: boolean;
	commissionedWriteMinimumCount: number;
};

// A structural projection needs a genuine story-position signal, not a bare
// common word: "part of her legacy", "makes a scene", and "skips a beat" are
// ordinary facts with one durable home. Require a numbered/qualified unit or
// an explicit story-structure compound before demanding a second projection.
const FICTION_STRUCTURE_PROJECTION_SIGNAL =
	/\b(?:part|act|chapter|scene)\s+(?:[ivxlcdm]{1,7}|\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(?:next|final|last|first|new|opening|closing)\s+(?:part|act|chapter|scene)\b|\b(?:story|chapter|plot)\s+beats?\b|\bplot\s+(?:point|turn)\b|\bstory\s+(?:arc|structure)\b/i;

/**
 * A living-reference project turns a plain declarative message into an
 * implicit document capture. Mount the two document writes directly and drop
 * operation/schema discovery for that turn; their full schemas are already in
 * the model tool definitions. Explicit mutation intents keep their normal
 * surface because deletes, cross-entity work, and ambiguous targets may still
 * need discovery.
 */
export function applyLivingWorkspaceToolProfile(params: {
	tools: ChatToolDefinition[];
	workspace: AgentWorkspaceMetadata | null | undefined;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
}): LivingWorkspaceToolSelection {
	const implicitCapture = Boolean(
		params.workspace?.mode === LIVING_REFERENCE_MODE &&
			!params.turnIntent?.requiresWrite &&
			looksLikeLivingWorkspaceCaptureTurn(params.latestUserMessage)
	);
	if (!implicitCapture) {
		return {
			tools: params.tools,
			implicitCapture: false,
			commissionedWriteMinimumCount: 0
		};
	}
	const storyStructureProjection = Boolean(
		(params.workspace?.domain_profile === 'fiction_story' ||
			params.workspace?.domain_affinity === 'writing.fiction') &&
			FICTION_STRUCTURE_PROJECTION_SIGNAL.test(params.latestUserMessage ?? '')
	);

	const materialized = materializeGatewayTools(params.tools, [
		'create_onto_document',
		'update_onto_document'
	]).tools;
	return {
		tools: materialized.filter(
			(tool) => !REDUNDANT_DIRECT_WRITE_DISCOVERY_TOOLS.has(tool.function?.name ?? '')
		),
		implicitCapture: true,
		// A plain canon addition needs one durable home. A fiction beat that also
		// changes narrative structure has two affected projections: the relevant
		// reference sheet and the story/chapter structure.
		commissionedWriteMinimumCount: storyStructureProjection ? 2 : 1
	};
}

export function selectFastChatTools(params: {
	contextType: ChatContextType;
	surfaceProfile?: GatewaySurfaceProfileName;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
	leanDiscovery?: boolean;
	allowLegacySurfaceFallback?: boolean;
}): ChatToolDefinition[] {
	let tools: ChatToolDefinition[];
	if (params.surfaceProfile) {
		tools = getGatewaySurfaceForProfile(params.surfaceProfile, {
			leanDiscovery: params.leanDiscovery
		});
	} else {
		const routedProfile = resolveFastChatSurfaceProfileForTurn({
			contextType: params.contextType,
			latestUserMessage: params.latestUserMessage,
			turnIntent: params.turnIntent,
			allowLegacySurfaceFallback: params.allowLegacySurfaceFallback
		});
		tools = routedProfile
			? getGatewaySurfaceForProfile(routedProfile, {
					leanDiscovery: params.leanDiscovery
				})
			: getGatewaySurfaceForContextType(params.contextType, {
					leanDiscovery: params.leanDiscovery
				});
	}
	const autonomousWriteTools = params.turnIntent
		? getAutonomousWriteToolNamesForTurnIntent(params.turnIntent)
		: [];
	const crossProjectTools = looksLikeCrossProjectTaskMove(
		params.contextType,
		[
			params.latestUserMessage,
			params.turnIntent?.source === 'pending_continuation'
				? params.turnIntent.originalRequestText
				: null
		]
			.filter(
				(value): value is string => typeof value === 'string' && value.trim().length > 0
			)
			.join('\n')
	)
		? ['move_onto_task']
		: [];
	const delegatedResearchTools = looksLikeDelegatedResearchTurn(
		[
			params.latestUserMessage,
			params.turnIntent?.source === 'pending_continuation'
				? params.turnIntent.originalRequestText
				: null
		]
			.filter(
				(value): value is string => typeof value === 'string' && value.trim().length > 0
			)
			.join('\n')
	)
		? ['delegate_task']
		: [];
	// tasker/39 stage 3: turns that plainly ask for web research get web tools
	// at launch (and with them the situational research rules), instead of
	// spending a discovery round finding web_search first.
	const webResearchTools = looksLikeWebResearchTurn(params.latestUserMessage)
		? ['web_search', 'web_visit']
		: [];
	return materializeGatewayTools(tools, [
		...autonomousWriteTools,
		...crossProjectTools,
		...delegatedResearchTools,
		...webResearchTools
	]).tools;
}

export function resolveFastChatSurfaceProfileForTurn(params: {
	contextType: ChatContextType;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
	allowLegacySurfaceFallback?: boolean;
}): GatewaySurfaceProfileName {
	const intentProfile = resolveSurfaceProfileForTurnIntent(params.contextType, params.turnIntent);
	if (intentProfile) return intentProfile;
	const routedProfile =
		params.allowLegacySurfaceFallback === false
			? null
			: resolveProjectSurfaceProfileForTurn(params.contextType, params.latestUserMessage);
	return routedProfile ?? resolveGatewaySurfaceProfileForContextType(params.contextType);
}

function resolveSurfaceProfileForTurnIntent(
	contextType: ChatContextType,
	turnIntent?: FastChatTurnIntent | null
): GatewaySurfaceProfileName | null {
	if (!turnIntent?.requiresWrite) return null;
	if (contextType === 'project_create') return 'project_create_minimal';
	if (contextType !== 'project' && contextType !== 'ontology') return null;
	const expectedWriteTools = getWriteToolNamesForTurnIntent(turnIntent);
	const hasDocumentOperation = expectedWriteTools.some((name) => name.includes('document'));
	const hasNonDocumentOperation = expectedWriteTools.some((name) => !name.includes('document'));
	if (hasDocumentOperation && hasNonDocumentOperation) return 'project_write_document';
	if (hasDocumentOperation) return 'project_document';
	if (
		expectedWriteTools.length > 0 &&
		expectedWriteTools.every((name) => name.includes('calendar_event'))
	) {
		return 'project_calendar';
	}
	return 'project_write';
}

function resolveProjectSurfaceProfileForTurn(
	contextType: ChatContextType,
	latestUserMessage?: string | null
): GatewaySurfaceProfileName | null {
	if (contextType !== 'project' && contextType !== 'ontology') {
		return null;
	}

	const text = latestUserMessage?.trim().toLowerCase() ?? '';
	if (!text) return null;

	const documentWriteTurn =
		looksLikeProjectDocumentWriteTurn(text) || looksLikeProjectDocumentOrganizeTurn(text);
	const mutationTurn = looksLikeProjectMutationTurn(text);

	// Mixed turns (e.g. "Chapter 2 complete — draft chapter 3 and save progress
	// notes") need both task writes and document workspace tools. Neither single
	// surface covers that, so prior runs fell back to tool_search for the
	// missing half. Route to the union surface instead.
	if (documentWriteTurn && mutationTurn) {
		return 'project_write_document';
	}
	if (documentWriteTurn) {
		return 'project_document';
	}
	if (mutationTurn) {
		return 'project_write';
	}

	return null;
}

function looksLikeProjectDocumentWriteTurn(text: string): boolean {
	return (
		/\b(?:append|capture|save|add|create|make|build|update|revise|draft|write|organize|move)\b[\s\S]{0,80}\b(?:document|doc|notes?|research|outline|brief|context|summary|log|chapter|scene)\b/i.test(
			text
		) || looksLikeImpliedProjectDocumentCommission(text)
	);
}

/**
 * A conservative detector for declarative artifact commissions. These are
 * requests such as "I think we need ... a pricing landscape doc" that clearly
 * ask for a durable work product without using an imperative write verb.
 */
export function looksLikeImpliedProjectDocumentCommission(text: string): boolean {
	const normalized = text.trim();
	if (!normalized) return false;
	const isInformationQuestion =
		normalized.endsWith('?') ||
		/^(?:what|which|how|why|when|where|who|do|does|did|is|are|can|could|would|should)\b/i.test(
			normalized
		);
	if (isInformationQuestion) return false;

	const namesDurableArtifact =
		/\b(?:document|doc|brief|report|outline|summary|landscape|analysis|research\s+log)\b/i.test(
			normalized
		);
	if (!namesDurableArtifact) return false;

	return (
		/\b(?:i|we)\s+(?:think\s+|probably\s+|really\s+)?(?:need|want)\b/i.test(normalized) ||
		/\b(?:i|we)\s+(?:could|would)\s+use\b/i.test(normalized) ||
		/\b(?:would|could)\s+be\s+(?:helpful|useful)\s+to\s+have\b/i.test(normalized)
	);
}

/**
 * Document-ORGANIZATION turns, order-free. The verb-then-noun regex above misses the way this
 * request is actually said: "this project's documents are a mess ... help me get it organized" —
 * nouns first, verb last, and "organized" (past participle) fails `\borganize\b`. Measured
 * 2026-07-26: that message resolved `project_basic` (zero write tools), so `project-organize`
 * failed 0/3 with the model reading six documents and never holding `move_document_in_tree`.
 * A doc-noun plus an organization verb anywhere in the message mounts the document surface; a
 * false positive costs surface tokens, never a write — restraint is owned by the model and gates.
 */
import { looksLikeProjectDocumentOrganizeTurn } from '@buildos/agentic-chat-runtime/loop';
export { looksLikeProjectDocumentOrganizeTurn };

function looksLikeProjectMutationTurn(text: string): boolean {
	return /\b(?:finished|complete|completed|done|progress|update|updated|add|create|capture|save|todo|task|revise|draft|wrote|mark|marked|move|blocked|in progress)\b/i.test(
		text
	);
}

function looksLikeCrossProjectTaskMove(
	contextType: ChatContextType,
	latestUserMessage?: string | null
): boolean {
	if (contextType !== 'project' && contextType !== 'ontology' && contextType !== 'global') {
		return false;
	}
	const text = latestUserMessage?.trim() ?? '';
	if (!text || !/\b(?:task|todo|item)\b/i.test(text)) return false;

	return (
		/\bwrong\s+project\b/i.test(text) ||
		/\b(?:move|moves|moved|moving|transfer|transfers|transferred|transferring|relocate|relocates|relocated|relocating)\b[\s\S]{0,100}\b(?:task|todo|item)\b[\s\S]{0,120}\b(?:to|into|between|another|different)\b[\s\S]{0,60}\bprojects?\b/i.test(
			text
		) ||
		/\b(?:task|todo|item)\b[\s\S]{0,100}\b(?:move|moves|moved|moving|transfer|transfers|transferred|transferring|relocate|relocates|relocated|relocating)\b[\s\S]{0,120}\b(?:to|into|between|another|different)\b[\s\S]{0,60}\bprojects?\b/i.test(
			text
		)
	);
}

function looksLikeDelegatedResearchTurn(latestUserMessage?: string | null): boolean {
	const text = latestUserMessage?.trim() ?? '';
	if (!text) return false;
	return (
		/\bdeep[-\s]?research\b/i.test(text) ||
		/\b(?:delegate|delegation|sub-?agents?|background agent|research swarm)\b/i.test(text) ||
		/\b(?:research|investigate|analy[sz]e)\b[\s\S]{0,100}\b(?:in the background|take your time|get back to me|report back)\b/i.test(
			text
		)
	);
}
