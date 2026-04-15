// apps/web/scripts/report-agentic-tool-surface-sizes.ts
import {
	buildCanonicalToolSurfaceSizeReports,
	formatToolSurfaceSizeMatrix,
	formatToolSurfaceSizeReport
} from '../src/lib/services/agentic-chat-v2/tool-surface-size-report';

const reports = buildCanonicalToolSurfaceSizeReports();

console.log('AGENTIC CHAT TOOL SURFACE SIZE REPORT');
console.log('');
console.log(formatToolSurfaceSizeMatrix(reports).join('\n'));
console.log('');

for (const report of reports) {
	console.log('────────────────────────────────────────');
	console.log(formatToolSurfaceSizeReport(report, { maxTools: 10 }).join('\n'));
	console.log('');
}
