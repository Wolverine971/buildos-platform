// apps/web/src/lib/services/agentic-chat-v2/scaffold-variant.test.ts
import { describe, expect, it } from 'vitest';
import { FASTCHAT_SCAFFOLD_VARIANT_IDS, resolveFastChatScaffoldConfig } from './scaffold-variant';

describe('resolveFastChatScaffoldConfig', () => {
	it('preserves production behavior when the eval variant is absent', () => {
		expect(
			resolveFastChatScaffoldConfig(undefined, {
				leanDiscovery: 'true',
				autonomousRecovery: 'true'
			})
		).toMatchObject({
			version: 1,
			variant: 'baseline',
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
				leanDiscovery: true,
				legacySurfaceFallback: true
			},
			recovery: {
				softForcedSynthesis: true,
				hardSafetyFinalization: true,
				autonomousRecovery: true
			}
		});
	});

	it.each(FASTCHAT_SCAFFOLD_VARIANT_IDS)('resolves the typed %s variant', (variant) => {
		expect(resolveFastChatScaffoldConfig(variant).variant).toBe(variant);
	});

	it('applies compound model-led and server-routing ablations', () => {
		expect(resolveFastChatScaffoldConfig('model-led-skill-discovery')).toMatchObject({
			prompt: {
				staticSkillCatalog: false,
				skillRoutingCoaching: false,
				domainSensing: true
			},
			routing: {
				domainSensing: true,
				skillPreload: true,
				skillGateRepair: true
			}
		});
		expect(resolveFastChatScaffoldConfig('no-server-skill-routing')).toMatchObject({
			prompt: {
				staticSkillCatalog: false,
				skillRoutingCoaching: false,
				domainSensing: false
			},
			routing: {
				domainSensing: false,
				skillPreload: false,
				skillGateRepair: false
			}
		});
	});

	it('separates removable synthesis coaching from hard safety finalization', () => {
		expect(resolveFastChatScaffoldConfig('no-soft-forced-synthesis')).toMatchObject({
			recovery: {
				softForcedSynthesis: false,
				hardSafetyFinalization: true
			}
		});
	});

	it('rejects free-form labels', () => {
		expect(() => resolveFastChatScaffoldConfig('baseline-ish')).toThrow(
			/Unknown FASTCHAT_EVAL_SCAFFOLD_VARIANT/
		);
	});
});
