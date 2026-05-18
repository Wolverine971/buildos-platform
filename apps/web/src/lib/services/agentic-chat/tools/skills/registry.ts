// apps/web/src/lib/services/agentic-chat/tools/skills/registry.ts
import { projectAuditSkill } from './audit.skill';
import { calendarSkill } from './calendar.skill';
import {
	coldEmailDeliverabilityReadinessSkill,
	coldEmailEngagementFirstOutreachSkill,
	coldEmailIcpSignalDesignSkill,
	coldEmailLearningReviewSkill,
	coldEmailOfferLabSkill,
	coldEmailOutreachCompilerSkill,
	coldEmailReplyOsSkill,
	coldEmailResearchAnchorsSkill,
	coldEmailTasteReviewSkill
} from './cold-email-outreach.skill';
import { documentSkill } from './document.skill';
import { projectForecastSkill } from './forecast.skill';
import { libriSkill } from './libri.skill';
import { linkedinCompanyPageGrowthSkill } from './linkedin-company-page-growth.skill';
import {
	algorithmAwarePublishingSkill,
	contentStrategyBeyondBloggingSkill,
	hookCraftShortFormSkill,
	storyDrivenContentCraftSkill,
	viralVideoScriptStructureSkill
} from './marketing-content.skill';
import { peopleSkill } from './people.skill';
import { planSkill } from './plan.skill';
import { projectCreateSkill } from './project-create.skill';
import { taskStateUpdatesSkill } from './task-state-updates.skill';
import { taskSkill } from './task.skill';
import type { SkillDefinition } from './types';
import {
	accessibilityInclusiveUiReviewSkill,
	buildQualityUiUxSkill,
	calmSoftwareDesignReviewSkill,
	delightfulProductReviewSkill,
	designSystemArchitectureReviewSkill,
	informationArchitectureReviewSkill,
	marketingSiteDesignReviewSkill,
	uiUxQualityReviewSkill,
	usabilityQuickResearchSkill,
	visualCraftFundamentalsSkill
} from './ui-ux.skill';
import { isLibriIntegrationEnabled } from '$lib/services/agentic-chat/tools/libri';

const ALL_SKILLS: SkillDefinition[] = [
	calendarSkill,
	documentSkill,
	planSkill,
	projectCreateSkill,
	taskSkill,
	taskStateUpdatesSkill,
	peopleSkill,
	buildQualityUiUxSkill,
	uiUxQualityReviewSkill,
	visualCraftFundamentalsSkill,
	accessibilityInclusiveUiReviewSkill,
	marketingSiteDesignReviewSkill,
	calmSoftwareDesignReviewSkill,
	delightfulProductReviewSkill,
	designSystemArchitectureReviewSkill,
	informationArchitectureReviewSkill,
	usabilityQuickResearchSkill,
	coldEmailEngagementFirstOutreachSkill,
	coldEmailIcpSignalDesignSkill,
	coldEmailOfferLabSkill,
	coldEmailResearchAnchorsSkill,
	coldEmailOutreachCompilerSkill,
	coldEmailTasteReviewSkill,
	coldEmailDeliverabilityReadinessSkill,
	coldEmailReplyOsSkill,
	coldEmailLearningReviewSkill,
	linkedinCompanyPageGrowthSkill,
	contentStrategyBeyondBloggingSkill,
	hookCraftShortFormSkill,
	viralVideoScriptStructureSkill,
	storyDrivenContentCraftSkill,
	algorithmAwarePublishingSkill,
	libriSkill,
	projectAuditSkill,
	projectForecastSkill
];

function isSkillEnabled(skill: SkillDefinition): boolean {
	return skill.id !== 'libri_knowledge' || isLibriIntegrationEnabled();
}

function getEnabledSkills(): SkillDefinition[] {
	return ALL_SKILLS.filter(isSkillEnabled);
}

function buildSkillsById(skills: SkillDefinition[]): Record<string, SkillDefinition> {
	return Object.fromEntries(skills.map((skill) => [skill.id, skill]));
}

function buildSkillsByReference(skills: SkillDefinition[]): Record<string, SkillDefinition> {
	return Object.fromEntries(
		skills.flatMap((skill) => [
			[skill.id, skill] as const,
			...skill.legacyPaths.map((legacyPath) => [legacyPath, skill] as const)
		])
	);
}

export function getSkillById(id: string): SkillDefinition | undefined {
	return buildSkillsById(getEnabledSkills())[id];
}

export function getSkillByReference(reference: string): SkillDefinition | undefined {
	return buildSkillsByReference(getEnabledSkills())[reference];
}

export function getSkillByPath(path: string): SkillDefinition | undefined {
	return getSkillByReference(path);
}

export function listAllSkills(): SkillDefinition[] {
	return [...getEnabledSkills()];
}

export function listRootSkills(): SkillDefinition[] {
	return getEnabledSkills().filter((skill) => !skill.parentId);
}

export function listChildSkills(): SkillDefinition[] {
	return getEnabledSkills().filter((skill) => Boolean(skill.parentId));
}

export function listChildSkillsForSkill(skillOrId: SkillDefinition | string): SkillDefinition[] {
	const parentId = typeof skillOrId === 'string' ? skillOrId : skillOrId.id;
	return getEnabledSkills()
		.filter((skill) => skill.parentId === parentId)
		.sort((a, b) => a.id.localeCompare(b.id));
}

export function isRegisteredSkillReference(reference: string): boolean {
	return Boolean(getSkillByReference(reference));
}

export function isRegisteredSkillPath(path: string): boolean {
	return isRegisteredSkillReference(path);
}

export function listSkillsForDirectory(
	path: string
): Array<{ name: string; type: 'skill'; summary: string }> {
	const prefix = path.endsWith('.') ? path : `${path}.`;
	return getEnabledSkills()
		.filter((skill) => {
			return skill.legacyPaths.some((legacyPath) => {
				if (!legacyPath.startsWith(prefix)) return false;
				const remainder = legacyPath.slice(prefix.length);
				if (remainder.length === 0) return false;
				const segments = remainder.split('.');
				return segments.length === 1 || (segments.length === 2 && segments[1] === 'skill');
			});
		})
		.map((skill) => ({
			name: skill.id,
			type: 'skill' as const,
			summary: skill.summary
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}
