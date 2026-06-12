// apps/web/scripts/check-agent-skills.ts
import {
	formatAgentSkillValidationReport,
	validatePublicAgentSkillCatalog
} from '../src/lib/server/agent-skills';

const strictWarnings = process.argv.includes('--strict');
const report = await validatePublicAgentSkillCatalog();

console.log(formatAgentSkillValidationReport(report, { strictWarnings }).join('\n'));

if (!report.ok || (strictWarnings && report.warnings > 0)) {
	process.exit(1);
}
