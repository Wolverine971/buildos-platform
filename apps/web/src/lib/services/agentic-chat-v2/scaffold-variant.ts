// apps/web/src/lib/services/agentic-chat-v2/scaffold-variant.ts
import type { LitePromptScaffoldOptions } from '$lib/services/agentic-chat-lite/prompt';

export const FASTCHAT_SCAFFOLD_VARIANT_IDS = [
	'baseline',
	'lean-discovery',
	'no-static-catalog',
	'no-retired-model-coaching',
	'no-legacy-surface-fallback',
	'model-led-skill-discovery',
	'no-server-skill-routing',
	'no-soft-forced-synthesis',
	'no-autonomous-recovery'
] as const;

export type FastChatScaffoldVariant = (typeof FASTCHAT_SCAFFOLD_VARIANT_IDS)[number];

export type FastChatScaffoldConfig = {
	version: 1;
	variant: FastChatScaffoldVariant;
	prompt: Required<LitePromptScaffoldOptions>;
	routing: {
		domainSensing: boolean;
		skillPreload: boolean;
		skillGateRepair: boolean;
		leanDiscovery: boolean;
		legacySurfaceFallback: boolean;
	};
	recovery: {
		softForcedSynthesis: boolean;
		hardSafetyFinalization: true;
		autonomousRecovery: boolean;
	};
};

export type FastChatScaffoldEnvironment = {
	leanDiscovery?: string;
	autonomousRecovery?: string;
};

const VARIANT_IDS = new Set<string>(FASTCHAT_SCAFFOLD_VARIANT_IDS);

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

function parseVariant(value: string | null | undefined): FastChatScaffoldVariant {
	const normalized = value?.trim() || 'baseline';
	if (VARIANT_IDS.has(normalized)) {
		return normalized as FastChatScaffoldVariant;
	}
	throw new Error(
		`Unknown FASTCHAT_EVAL_SCAFFOLD_VARIANT "${normalized}". Expected one of: ${FASTCHAT_SCAFFOLD_VARIANT_IDS.join(', ')}.`
	);
}

export function resolveFastChatScaffoldConfig(
	value: string | null | undefined,
	environment: FastChatScaffoldEnvironment = {}
): FastChatScaffoldConfig {
	const variant = parseVariant(value);
	const config: FastChatScaffoldConfig = {
		version: 1,
		variant,
		prompt: {
			staticSkillCatalog: true,
			skillRoutingCoaching: true,
			retiredModelCoaching: true,
			domainSensing: true
		},
		routing: {
			domainSensing: true,
			skillPreload: true,
			skillGateRepair: true,
			leanDiscovery: parseBooleanFlag(environment.leanDiscovery, false),
			legacySurfaceFallback: true
		},
		recovery: {
			softForcedSynthesis: true,
			hardSafetyFinalization: true,
			autonomousRecovery: parseBooleanFlag(environment.autonomousRecovery, false)
		}
	};

	switch (variant) {
		case 'lean-discovery':
			config.routing.leanDiscovery = true;
			break;
		case 'no-static-catalog':
			config.prompt.staticSkillCatalog = false;
			break;
		case 'no-retired-model-coaching':
			config.prompt.retiredModelCoaching = false;
			break;
		case 'no-legacy-surface-fallback':
			config.routing.legacySurfaceFallback = false;
			break;
		case 'model-led-skill-discovery':
			config.prompt.staticSkillCatalog = false;
			config.prompt.skillRoutingCoaching = false;
			break;
		case 'no-server-skill-routing':
			config.prompt.staticSkillCatalog = false;
			config.prompt.skillRoutingCoaching = false;
			config.prompt.domainSensing = false;
			config.routing.domainSensing = false;
			config.routing.skillPreload = false;
			config.routing.skillGateRepair = false;
			break;
		case 'no-soft-forced-synthesis':
			config.recovery.softForcedSynthesis = false;
			break;
		case 'no-autonomous-recovery':
			config.recovery.autonomousRecovery = false;
			break;
		case 'baseline':
			break;
	}

	return config;
}

export function resolveFastChatScaffoldConfigFromEnv(
	env: Record<string, string | undefined>
): FastChatScaffoldConfig {
	return resolveFastChatScaffoldConfig(env.FASTCHAT_EVAL_SCAFFOLD_VARIANT, {
		leanDiscovery: env.FASTCHAT_LEAN_DISCOVERY,
		autonomousRecovery: env.FASTCHAT_ENABLE_AUTONOMOUS_RECOVERY
	});
}
