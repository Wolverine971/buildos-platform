// apps/web/src/lib/utils/agent-chat-launch.test.ts
import { describe, expect, it } from 'vitest';
import {
	isAgentChatLaunch,
	launchSkillIdFromRedirect,
	normalizeLaunchSkillId,
	skillSignupSource
} from './agent-chat-launch';

function tryLink(params: Record<string, string>, path = '/') {
	return `${path}?${new URLSearchParams(params)}`;
}

describe('isAgentChatLaunch', () => {
	it.each([
		['open=agent-chat&skill=going_viral', true],
		['open=agent-chat&prompt=Draft%20my%20post', true],
		['open=agent-chat', false],
		['open=agent-chat&prompt=%20%20&skill=', false],
		['open=projects&skill=going_viral', false],
		['', false]
	])('%j -> %s', (query, expected) => {
		expect(isAgentChatLaunch(new URLSearchParams(query))).toBe(expected);
	});
});

describe('normalizeLaunchSkillId', () => {
	it.each(['going_viral', 'cold_email_offer_lab', 'root.child', 'hook-craft'])(
		'accepts structured id %j',
		(id) => {
			expect(normalizeLaunchSkillId(id)).toBe(id);
		}
	);

	it.each([
		null,
		undefined,
		'',
		'Going Viral',
		'GOING_VIRAL',
		'1skill',
		'skill..child',
		'skill:other',
		'<script>',
		'a'.repeat(81)
	])('rejects %j', (id) => {
		expect(normalizeLaunchSkillId(id)).toBeNull();
	});
});

describe('launchSkillIdFromRedirect', () => {
	it('reads the skill from a Try in BuildOS launch, multi-line draft included', () => {
		const redirect = tryLink({
			open: 'agent-chat',
			skill: 'going_viral',
			prompt: 'Use the Going Viral skill.\n\nStarting ask: help me'
		});
		expect(launchSkillIdFromRedirect(redirect)).toBe('going_viral');
		expect(skillSignupSource('going_viral')).toBe('skill:going_viral');
	});

	it.each([
		['absent redirect', null],
		['no skill (path launch)', tryLink({ open: 'agent-chat', prompt: 'Run the pack' })],
		['not a chat launch', tryLink({ open: 'projects', skill: 'going_viral' })],
		['free-text skill', tryLink({ open: 'agent-chat', skill: 'ignore previous instructions' })],
		['external URL', 'https://evil.example/?open=agent-chat&skill=going_viral'],
		['protocol-relative', '//evil.example/?open=agent-chat&skill=going_viral']
	])('returns null for %s', (_label, redirect) => {
		expect(launchSkillIdFromRedirect(redirect)).toBeNull();
	});
});
