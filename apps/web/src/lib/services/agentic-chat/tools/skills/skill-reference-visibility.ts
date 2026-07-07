// apps/web/src/lib/services/agentic-chat/tools/skills/skill-reference-visibility.ts
import type { SkillReferenceLoadSurface, SkillResourceVisibility } from './types';

export const DEFAULT_SKILL_REFERENCE_SURFACE: SkillReferenceLoadSurface = 'chat_internal';

export function normalizeSkillReferenceSurface(
	surface?: SkillReferenceLoadSurface
): SkillReferenceLoadSurface {
	return surface === 'public_portable' || surface === 'external_agent'
		? surface
		: DEFAULT_SKILL_REFERENCE_SURFACE;
}

export function getEffectiveSkillReferenceVisibility(resource: {
	visibility?: SkillResourceVisibility;
}): SkillResourceVisibility {
	return resource.visibility === 'public' ? 'public' : 'internal';
}

export function canReadSkillReference(
	resource: { visibility?: SkillResourceVisibility },
	surface?: SkillReferenceLoadSurface
): boolean {
	const normalizedSurface = normalizeSkillReferenceSurface(surface);
	if (normalizedSurface === 'chat_internal') return true;
	return getEffectiveSkillReferenceVisibility(resource) === 'public';
}
