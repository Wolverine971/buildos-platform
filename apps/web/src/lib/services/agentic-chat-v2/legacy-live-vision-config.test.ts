// apps/web/src/lib/services/agentic-chat-v2/legacy-live-vision-config.test.ts

import { describe, expect, it } from 'vitest';
import { resolveAgenticChatLegacyLiveVisionEnabled } from './legacy-live-vision-config';

describe('resolveAgenticChatLegacyLiveVisionEnabled', () => {
	it('allows legacy vision while worker vision remains disabled', () => {
		expect(
			resolveAgenticChatLegacyLiveVisionEnabled({
				AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED: 'true',
				AGENT_CHAT_LIVE_VISION_ENABLED: 'false'
			})
		).toBe(true);
	});

	it('lets the dedicated legacy switch disable vision independently', () => {
		expect(
			resolveAgenticChatLegacyLiveVisionEnabled({
				AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED: 'false',
				AGENT_CHAT_LIVE_VISION_ENABLED: 'true'
			})
		).toBe(false);
	});

	it('inherits the shared switch when the dedicated value is absent', () => {
		expect(
			resolveAgenticChatLegacyLiveVisionEnabled({
				AGENT_CHAT_LIVE_VISION_ENABLED: 'true'
			})
		).toBe(true);
	});

	it('fails closed for an invalid dedicated value', () => {
		expect(
			resolveAgenticChatLegacyLiveVisionEnabled({
				AGENT_CHAT_LEGACY_LIVE_VISION_ENABLED: 'TRUE-ish',
				AGENT_CHAT_LIVE_VISION_ENABLED: 'true'
			})
		).toBe(false);
	});
});
