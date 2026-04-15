// apps/web/scripts/report-agentic-tool-surface-sizes.ts
import {
	buildCanonicalToolSurfaceSizeReports,
	buildGatewayProfileToolSurfaceSizeReports,
	formatToolSurfaceSizeMatrix,
	formatToolSurfaceSizeReport
} from '../src/lib/services/agentic-chat-v2/tool-surface-size-report';

const reports = buildCanonicalToolSurfaceSizeReports();
const profileReports = buildGatewayProfileToolSurfaceSizeReports();

console.log('AGENTIC CHAT TOOL SURFACE SIZE REPORT');
console.log('');
console.log(formatToolSurfaceSizeMatrix(reports).join('\n'));
console.log('');
console.log(formatToolSurfaceSizeMatrix(profileReports).join('\n'));
console.log('');

for (const report of [...reports, ...profileReports]) {
	console.log('────────────────────────────────────────');
	console.log(formatToolSurfaceSizeReport(report, { maxTools: 10 }).join('\n'));
	console.log('');
}
