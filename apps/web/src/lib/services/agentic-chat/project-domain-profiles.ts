// apps/web/src/lib/services/agentic-chat/project-domain-profiles.ts
// Lightweight, data-driven project-domain profiles.
//
// These are deliberately smaller than runtime skills. A profile supplies the
// few domain distinctions needed before a project exists and persists a compact
// affinity signal that later project chats can use without lexical rediscovery.

type JsonRecord = Record<string, unknown>;

export const AGENT_WORKSPACE_PROP = 'agent_workspace';
export const LIVING_REFERENCE_MODE = 'living_reference';

export type AgentWorkspaceMetadata = {
	mode?: string;
	domain_profile?: string;
	domain_affinity?: string;
};

export type ProjectDomainProfile = {
	id: string;
	name: string;
	domainAffinity: string;
	runtimeSkillId?: string;
	matchesRuntimeSkillTurn?: (message: string) => boolean;
	matchesProjectType: (typeKey: string) => boolean;
	matchesUserMessage: (message: string) => boolean;
	creationGuidance: string[];
};

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

const FICTION_STRONG_SIGNAL = /\b(?:novel|screenplay|short\s+story|story\s+bible|worldbuilding)\b/i;
const FICTION_WRITING_CONTEXT =
	/\b(?:fiction|manuscript)\b[\s\S]{0,80}\b(?:writ|author|character|plot|chapter|scene|story)\w*\b|\b(?:writ|author|character|plot|chapter|scene|story)\w*\b[\s\S]{0,80}\b(?:fiction|manuscript)\b/i;
const FICTION_BOOK_CONTEXT =
	/\bbook\b[\s\S]{0,100}\b(?:writ|author|character|plot|chapter|scene|story|part|act)\w*\b|\b(?:writ|author|character|plot|chapter|scene|story|part|act)\w*\b[\s\S]{0,100}\bbook\b/i;
const FICTION_CRAFT_CLUSTER =
	/\b(?:character\s+arc|plot\s+(?:beat|outline|structure)|chapter\s+\d+|scene\s+beat|three[-\s]?act|hero(?:'s|s)?\s+journey)\b/i;

export const FICTION_STORY_PROFILE: ProjectDomainProfile = {
	id: 'fiction_story',
	name: 'Fiction story workspace',
	domainAffinity: 'writing.fiction',
	runtimeSkillId: 'fiction_story_craft',
	matchesRuntimeSkillTurn: looksLikeFictionStoryCraftTurn,
	matchesProjectType: (typeKey) =>
		/^project\.creative\.(?:novel|book|fiction|screenplay)(?:\.|$)/i.test(typeKey),
	matchesUserMessage: (message) =>
		FICTION_STRONG_SIGNAL.test(message) ||
		FICTION_WRITING_CONTEXT.test(message) ||
		FICTION_BOOK_CONTEXT.test(message) ||
		FICTION_CRAFT_CLUSTER.test(message),
	creationGuidance: [
		'Treat parts, acts, chapters, scenes, and beats as narrative structure. They are not milestones or delivery dates unless the user explicitly supplied a writing schedule.',
		'When the user supplies parts, acts, chapter beats, or a plot spine, create one lightweight `document.creative.structure` artifact that preserves every supplied part name and controlling beat, premise, or story pressure.',
		'Create `document.creative.character` sheets only for central or meaningfully described characters; keep incidental names together until they earn a dedicated sheet. Each dedicated sheet must contain the confirmed role, desire, conflict, backstory, relationship, and other details the user supplied for that character—never create a title-only placeholder.',
		'Use `document.creative.world` for durable setting or world rules. Do not route fiction artifacts to product, software, or business document types.',
		'Every initial creative document must contain the relevant confirmed facts from the opening brain dump. Do not trade content completeness for a larger number of documents.',
		'Prefer useful canonical documents over empty category containers. Initial documents may remain at the root; hierarchy can emerge later when document density makes grouping useful.'
	]
};

const PROJECT_DOMAIN_PROFILES: ProjectDomainProfile[] = [FICTION_STORY_PROFILE];

export function resolveProjectDomainProfile(input: {
	userMessage?: string | null;
	projectTypeKey?: string | null;
	domainProfileId?: string | null;
}): ProjectDomainProfile | null {
	const explicitProfileId = normalizeText(input.domainProfileId);
	if (explicitProfileId) {
		const explicit = PROJECT_DOMAIN_PROFILES.find(
			(profile) => profile.id === explicitProfileId
		);
		if (explicit) return explicit;
	}

	const projectTypeKey = normalizeText(input.projectTypeKey);
	if (projectTypeKey) {
		const typeMatch = PROJECT_DOMAIN_PROFILES.find((profile) =>
			profile.matchesProjectType(projectTypeKey)
		);
		if (typeMatch) return typeMatch;
	}

	const userMessage = normalizeText(input.userMessage);
	if (!userMessage) return null;
	return (
		PROJECT_DOMAIN_PROFILES.find((profile) => profile.matchesUserMessage(userMessage)) ?? null
	);
}

const LIVING_WORKSPACE_PATTERNS = [
	/\b(?:ongoing|living)\s+(?:room|reference|source\s+of\s+truth|knowledge\s+base)\b/i,
	/\b(?:ongoing|living)\s+workspace\b[\s\S]{0,100}\b(?:capture|organize|update|reference|canon|notes?|source\s+of\s+truth)\b/i,
	/\bkeep\s+(?:this|it|the\s+(?:project|workspace|book|notes?))\s+organi[sz]ed\b/i,
	/\b(?:continually|continuously|automatically)\s+(?:capture|organize|update)\b/i,
	/\bas\s+i\s+(?:add|drop|share|tell\s+you)\b[\s\S]{0,80}\b(?:capture|organize|update|reference|canon|notes?)\b/i,
	/\b(?:whenever|every\s+time)\s+i\s+(?:add|drop|share|mention)\b/i,
	/\b(?:capture|organize|update)\b[\s\S]{0,80}\b(?:as\s+we\s+go|over\s+time|across\s+chats?)\b/i
];

export function looksLikeLivingWorkspaceCommission(message: string | null | undefined): boolean {
	const normalized = normalizeText(message);
	return Boolean(
		normalized && LIVING_WORKSPACE_PATTERNS.some((pattern) => pattern.test(normalized))
	);
}

function shouldEnableLivingReference(
	message: string | null | undefined,
	profile: ProjectDomainProfile | null
): boolean {
	if (looksLikeLivingWorkspaceCommission(message)) return true;
	const normalized = normalizeText(message);
	return Boolean(profile && /\b(?:ongoing|living)\s+workspace\b/i.test(normalized));
}

const ADVICE_OR_PROPOSAL_PATTERN =
	/\?|\b(?:what\s+should|what\s+happens?|how\s+should|give\s+me|show\s+me|tell\s+me|explain|summari[sz]e|recap|compare|analy[sz]e|evaluate|critique|suggest|brainstorm|options?|possibilities|help\s+me\s+decide|could\s+(?:happen|be)|would\s+it)\b/i;
const GENERATED_CONTENT_REQUEST_PATTERN =
	/\b(?:draft|write|generate|compose|continue|outline)\b[\s\S]{0,45}\b(?:scene|chapter|passage|paragraph|dialogue|prose|version|draft|outline)\b/i;
const CASUAL_ACKNOWLEDGEMENT_PATTERN =
	/^(?:ok(?:ay)?|thanks?(?:\s+you)?|got\s+it|sounds?\s+good|great|perfect|nice|cool|yes|no|yep|nope|agreed|continue|go\s+ahead)[.!\s]*$/i;

/**
 * A living-reference commission turns plain declarative additions into an
 * implicit capture request. Questions and option-generation requests remain
 * read-only unless the user separately asks to save a choice.
 */
export function looksLikeLivingWorkspaceCaptureTurn(message: string | null | undefined): boolean {
	const normalized = normalizeText(message);
	if (!normalized || normalized.length < 3) return false;
	return !(
		ADVICE_OR_PROPOSAL_PATTERN.test(normalized) ||
		GENERATED_CONTENT_REQUEST_PATTERN.test(normalized) ||
		CASUAL_ACKNOWLEDGEMENT_PATTERN.test(normalized)
	);
}

const FICTION_CRAFT_DIRECT_PATTERN =
	/\b(?:what\s+(?:should|could|might)\s+happen|what\s+happens?\s+next|where\s+should\s+(?:the\s+)?story\s+go|give\s+me\s+(?:some\s+)?options?|which\s+(?:option|direction|path))\b/i;
const FICTION_DRAFT_PATTERN =
	/\b(?:draft|write|continue|compose)\b[\s\S]{0,55}\b(?:scene|chapter|passage|dialogue|prose|ending|opening)\b/i;
const FICTION_CRAFT_SUBJECT_PATTERN =
	/\b(?:character(?:s|\s+arc|\s+development)?|protagonist|antagonist|plot|story\s+(?:arc|beat|structure|continuity)|chapter|scene|act|part|arc|beat|ending|opening|pacing|theme|worldbuilding|world\s+rule|lore|continuity|dialogue|point\s+of\s+view|pov|motivation|stakes|conflict|reveal|reversal|twist)\b/i;
const FICTION_CRAFT_ADVICE_PATTERN =
	/\?|\b(?:options?|possibilities|suggest|recommend|should|could|might|brainstorm|develop|plan|outline|revise|rewrite|critique|review|fix|check|draft|write|continue)\b/i;
const OPERATIONAL_PROJECT_TURN_PATTERN =
	/\b(?:schedule|deadline|due\s+date|calendar|remind(?:er)?|milestone|timeline|project\s+status|status\s+of\s+(?:the\s+)?project|publish\s+date|release\s+date)\b/i;
const PROJECT_TASK_OPERATION_PATTERN =
	/\b(?:create|add|update|complete|delete|move|schedule|show|list|review|prioriti[sz]e|organi[sz]e)\b[\s\S]{0,35}\btasks?\b|\btasks?\b[\s\S]{0,35}\b(?:create|add|update|complete|delete|move|schedule|show|list|review|prioriti[sz]e|organi[sz]e)\b/i;

/**
 * Detects turns that benefit from fiction-specific reasoning rather than the
 * lightweight living-reference capture path. Project affinity supplies the
 * missing subject context, so terse follow-ups such as “give me three options”
 * can still activate while scheduling requests stay operational.
 */
export function looksLikeFictionStoryCraftTurn(message: string | null | undefined): boolean {
	const normalized = normalizeText(message);
	if (!normalized || CASUAL_ACKNOWLEDGEMENT_PATTERN.test(normalized)) return false;
	if (
		OPERATIONAL_PROJECT_TURN_PATTERN.test(normalized) ||
		PROJECT_TASK_OPERATION_PATTERN.test(normalized)
	) {
		return false;
	}
	if (FICTION_DRAFT_PATTERN.test(normalized)) return true;
	if (FICTION_CRAFT_DIRECT_PATTERN.test(normalized)) return true;
	return (
		FICTION_CRAFT_SUBJECT_PATTERN.test(normalized) &&
		FICTION_CRAFT_ADVICE_PATTERN.test(normalized)
	);
}

export function resolveProjectDomainRuntimeSkillId(input: {
	workspace: AgentWorkspaceMetadata | null | undefined;
	latestUserMessage: string | null | undefined;
	implicitCapture?: boolean;
}): string | null {
	if (input.implicitCapture) return null;
	const workspace = input.workspace;
	if (!workspace) return null;
	const profile = resolveProjectDomainProfile({
		domainProfileId: workspace.domain_profile
	});
	if (!profile?.runtimeSkillId || !profile.matchesRuntimeSkillTurn) return null;
	if (workspace.domain_affinity && workspace.domain_affinity !== profile.domainAffinity) {
		return null;
	}
	return profile.matchesRuntimeSkillTurn(normalizeText(input.latestUserMessage))
		? profile.runtimeSkillId
		: null;
}

export function readAgentWorkspaceMetadata(value: unknown): AgentWorkspaceMetadata | null {
	if (!isRecord(value)) return null;
	const candidate = isRecord(value[AGENT_WORKSPACE_PROP]) ? value[AGENT_WORKSPACE_PROP] : value;
	const mode =
		normalizeText(candidate.mode) === LIVING_REFERENCE_MODE ? LIVING_REFERENCE_MODE : '';
	const profile = PROJECT_DOMAIN_PROFILES.find(
		(item) => item.id === normalizeText(candidate.domain_profile)
	);
	if (!mode && !profile) return null;
	return {
		...(mode ? { mode } : {}),
		...(profile ? { domain_profile: profile.id, domain_affinity: profile.domainAffinity } : {})
	};
}

export function resolveAgentWorkspaceFromContextData(data: unknown): AgentWorkspaceMetadata | null {
	if (!isRecord(data)) return null;
	const startHere = isRecord(data.start_here) ? data.start_here : null;
	const project = isRecord(data.project) ? data.project : null;
	return (
		readAgentWorkspaceMetadata(startHere?.agent_workspace) ??
		readAgentWorkspaceMetadata(startHere?.props) ??
		readAgentWorkspaceMetadata(project?.agent_workspace) ??
		readAgentWorkspaceMetadata(project?.props)
	);
}

export function applyProjectCreationProfileDefaults<T extends JsonRecord>(
	args: T,
	userMessage: string | null | undefined
): T {
	if (!isRecord(args.project)) return args;

	const profile = resolveProjectDomainProfile({
		userMessage,
		projectTypeKey: normalizeText(args.project.type_key)
	});
	const livingReference = shouldEnableLivingReference(userMessage, profile);
	const projectProps = isRecord(args.project.props) ? args.project.props : {};
	const { [AGENT_WORKSPACE_PROP]: _discardedProjectWorkspace, ...safeProjectProps } =
		projectProps;
	const contextDocument = isRecord(args.context_document) ? args.context_document : null;
	const contextProps =
		contextDocument && isRecord(contextDocument.props) ? contextDocument.props : {};
	const { [AGENT_WORKSPACE_PROP]: _discardedContextWorkspace, ...safeContextProps } =
		contextProps;

	// agent_workspace is a reserved server-owned contract. Strip model-supplied
	// values even when no profile applies so stored data cannot promote itself
	// into future system-level behavior.
	if (!profile && !livingReference) {
		if (!(_discardedProjectWorkspace || _discardedContextWorkspace)) return args;
		return {
			...args,
			project: { ...args.project, props: safeProjectProps },
			...(contextDocument
				? { context_document: { ...contextDocument, props: safeContextProps } }
				: {})
		} as T;
	}

	const agentWorkspace: AgentWorkspaceMetadata = {
		...(profile
			? {
					domain_profile: profile.id,
					domain_affinity: profile.domainAffinity
				}
			: {}),
		...(livingReference ? { mode: LIVING_REFERENCE_MODE } : {})
	};

	const nextArgs: JsonRecord = {
		...args,
		project: {
			...args.project,
			props: {
				...safeProjectProps,
				[AGENT_WORKSPACE_PROP]: agentWorkspace
			}
		}
	};

	if (contextDocument) {
		nextArgs.context_document = {
			...contextDocument,
			props: {
				...safeContextProps,
				[AGENT_WORKSPACE_PROP]: agentWorkspace
			}
		};
	}

	return nextArgs as T;
}

const CALENDAR_DATE_PATTERN =
	/(?:\b20\d{2}[-/]\d{1,2}(?:[-/]\d{1,2})?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+\d{1,2})?(?:,?\s+20\d{2})?)/i;
const RELATIVE_SCHEDULE_PATTERN =
	/\b(?:today|tomorrow|tonight|next\s+(?:week|month|quarter|year)|this\s+(?:week|month|quarter|year)|within\s+\d+\s+(?:days?|weeks?|months?|years?)|over\s+the\s+next\s+\d+\s+(?:days?|weeks?|months?|years?)|q[1-4]\s+20\d{2})\b/i;
const SCHEDULE_LANGUAGE_PATTERN =
	/\b(?:deadline|due\s+date|target\s+date|delivery\s+date|project\s+timeline|writing\s+schedule|publication\s+date|release\s+date)\b/i;
const ACTION_BY_DATE_PATTERN =
	/\b(?:finish|complete|publish|release|launch|deliver|write|draft|revise|submit)\w*\b[\s\S]{0,70}\b(?:by|within|over\s+the\s+next)\b[\s\S]{0,45}(?:20\d{2}|\d{1,2}[/-]\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|day|week|month|quarter|year)/i;
const NAMED_ITEM_BY_DATE_PATTERN =
	/\b(?:part|phase|milestone|draft|chapter|volume|version)\s+[\w.-]+[\s\S]{0,45}\bby\b[\s\S]{0,35}(?:20\d{2}|\d{1,2}[/-]\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|day|week|month|quarter|year)/i;

export function hasExplicitProjectScheduleSignal(message: string | null | undefined): boolean {
	const normalized = normalizeText(message);
	if (!normalized) return false;
	if (SCHEDULE_LANGUAGE_PATTERN.test(normalized)) return true;
	if (ACTION_BY_DATE_PATTERN.test(normalized) || NAMED_ITEM_BY_DATE_PATTERN.test(normalized)) {
		return true;
	}
	return (
		/\b(?:due|deadline|schedule|timeline|target|publish|release|deliver)\w*\b/i.test(
			normalized
		) &&
		(CALENDAR_DATE_PATTERN.test(normalized) || RELATIVE_SCHEDULE_PATTERN.test(normalized))
	);
}

export function validateProjectCreationMilestoneGrounding(
	args: JsonRecord,
	userMessage: string | null | undefined
): string[] {
	if (!Array.isArray(args.entities)) return [];
	const milestones = args.entities.filter(
		(entity: unknown) => isRecord(entity) && entity.kind === 'milestone'
	);
	if (milestones.length === 0 || hasExplicitProjectScheduleSignal(userMessage)) return [];

	return [
		'Project milestones require schedule evidence from the user. The source message contains no project deadline or delivery schedule, so remove the milestone entities and represent undated phases as plans or documents. Never invent due_at values to satisfy the milestone schema.'
	];
}

export function renderProjectCreationProfileGuidance(
	userMessage: string | null | undefined
): { profile: ProjectDomainProfile; content: string } | null {
	const profile = resolveProjectDomainProfile({ userMessage });
	if (!profile) return null;
	const livingReference = shouldEnableLivingReference(userMessage, profile);
	const lines = [
		`Project starter profile: ${profile.name} (${profile.id}).`,
		...profile.creationGuidance.map((line) => `- ${line}`),
		livingReference
			? `- The user explicitly commissioned an ongoing living workspace. Set project.props.${AGENT_WORKSPACE_PROP}.mode to \`${LIVING_REFERENCE_MODE}\`; future chats will use it to capture user-confirmed durable additions.`
			: null,
		`- Set project.props.${AGENT_WORKSPACE_PROP}.domain_profile to \`${profile.id}\` and domain_affinity to \`${profile.domainAffinity}\` so new chats retain the project domain.`
	]
		.filter((line): line is string => Boolean(line))
		.join('\n');
	return { profile, content: lines };
}
