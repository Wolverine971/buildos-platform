// apps/web/scripts/audit-enum-values.ts
import { createCustomClient } from '@buildos/supabase-client';
import type { Database } from '@buildos/shared-types';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	console.error('Missing Supabase environment variables');
	process.exit(1);
}

const supabase = createCustomClient(supabaseUrl, supabaseAnonKey);

interface EnumFieldAudit {
	table: string;
	field: string;
	distinctValues: { value: string; count: number }[];
	totalRows: number;
	nullCount: number;
}

async function getDistinctValues(
	table: string,
	field: string
): Promise<{ value: string; count: number }[]> {
	try {
		const { data, error } = await supabase.rpc('get_distinct_values', {
			table_name: table,
			column_name: field
		});

		if (error) {
			// If RPC doesn't exist, use direct query
			const query = supabase.from(table as any).select(field);
			const { data: rawData, error: queryError } = await query;

			if (queryError) {
				console.error(`Error querying ${table}.${field}:`, queryError);
				return [];
			}

			// Process raw data to get distinct values and counts
			const valueCounts = new Map<string, number>();
			for (const row of rawData || []) {
				const value = row[field];
				if (value !== null) {
					valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
				}
			}

			return Array.from(valueCounts.entries())
				.map(([value, count]) => ({ value, count }))
				.sort((a, b) => b.count - a.count);
		}

		return data || [];
	} catch (error) {
		console.error(`Error getting distinct values for ${table}.${field}:`, error);
		return [];
	}
}

async function auditEnumFields(): Promise<EnumFieldAudit[]> {
	const fieldsToAudit = [
		{ table: 'projects', field: 'status' },
		{ table: 'tasks', field: 'status' },
		{ table: 'tasks', field: 'priority' },
		{ table: 'tasks', field: 'task_type' },
		{ table: 'tasks', field: 'recurrence_pattern' },
		{ table: 'customer_subscriptions', field: 'status' },
		{ table: 'beta_feedback', field: 'feedback_status' },
		{ table: 'beta_feedback', field: 'feedback_priority' },
		{ table: 'beta_feedback', field: 'feedback_type' },
		{ table: 'email_logs', field: 'status' },
		{ table: 'daily_briefs', field: 'generation_status' },
		{ table: 'brain_dumps', field: 'status' },
		{ table: 'beta_events', field: 'event_status' },
		{ table: 'beta_events', field: 'event_type' },
		{ table: 'beta_event_attendance', field: 'rsvp_status' },
		{ table: 'beta_signups', field: 'signup_status' },
		{ table: 'projects_history', field: 'status' },
		{ table: 'task_calendar_events', field: 'sync_status' },
		{ table: 'users', field: 'subscription_status' },
		{ table: 'calendar_webhooks', field: 'event_type' },
		{ table: 'email_templates', field: 'status' },
		{ table: 'emails', field: 'status' },
		{ table: 'invoices', field: 'status' },
		{ table: 'onboarding_events', field: 'event_type' },
		{ table: 'user_projects', field: 'priority' },
		{ table: 'webhooks', field: 'status' }
	];

	const results: EnumFieldAudit[] = [];

	for (const { table, field } of fieldsToAudit) {
		console.log(`Auditing ${table}.${field}...`);

		// Get distinct values
		const distinctValues = await getDistinctValues(table, field);

		// Get total count
		const { count: totalCount } = await supabase
			.from(table as any)
			.select('*', { count: 'exact', head: true });

		// Get null count
		const { count: nullCount } = await supabase
			.from(table as any)
			.select('*', { count: 'exact', head: true })
			.is(field, null);

		results.push({
			table,
			field,
			distinctValues,
			totalRows: totalCount || 0,
			nullCount: nullCount || 0
		});
	}

	return results;
}

async function main() {
	console.log('Starting enum fields audit...\n');

	const auditResults = await auditEnumFields();

	// Generate report
	let report = '# Database Enum Values Audit Report\n\n';
	report += `Generated: ${new Date().toISOString()}\n\n`;
	report += '## Summary\n\n';
	report += `Total fields audited: ${auditResults.length}\n\n`;

	for (const result of auditResults) {
		report += `### ${result.table}.${result.field}\n\n`;
		report += `- **Total rows**: ${result.totalRows}\n`;
		report += `- **Null values**: ${result.nullCount} (${
			result.totalRows > 0 ? ((result.nullCount / result.totalRows) * 100).toFixed(1) : 0
		}%)\n`;
		report += `- **Distinct values**: ${result.distinctValues.length}\n\n`;

		if (result.distinctValues.length > 0) {
			report += '| Value | Count | Percentage |\n';
			report += '|-------|-------|------------|\n';

			const nonNullTotal = result.totalRows - result.nullCount;
			for (const { value, count } of result.distinctValues) {
				const percentage =
					nonNullTotal > 0 ? ((count / nonNullTotal) * 100).toFixed(1) : '0';
				report += `| \`${value}\` | ${count} | ${percentage}% |\n`;
			}
			report += '\n';
		} else {
			report += '*No non-null values found*\n\n';
		}
	}

	// Save report
	const reportPath = path.join(process.cwd(), 'docs', 'audits', 'enum-values-audit.md');
	fs.writeFileSync(reportPath, report);
	console.log(`\nReport saved to: ${reportPath}`);

	// Also save as JSON for programmatic use
	const jsonPath = path.join(process.cwd(), 'docs', 'audits', 'enum-values-audit.json');
	fs.writeFileSync(jsonPath, JSON.stringify(auditResults, null, 2));
	console.log(`JSON data saved to: ${jsonPath}`);
}

main().catch(console.error);
