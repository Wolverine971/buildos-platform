// apps/web/src/lib/server/email-suppression-scope.ts
// Which opt-out an unsubscribe click records, read from the sent email's row.

export type SuppressionScope = 'lifecycle' | 'daily_brief' | 'marketing';

type EmailRow = { category?: unknown; template_data?: unknown };

function templateDataOf(email: EmailRow): Record<string, any> {
	return email.template_data && typeof email.template_data === 'object'
		? (email.template_data as Record<string, any>)
		: {};
}

export function isDailyBriefEmail(email: EmailRow): boolean {
	const templateData = templateDataOf(email);
	return (
		email.category === 'daily_brief' ||
		templateData.category === 'daily_brief' ||
		templateData.category === 'daily-brief' ||
		templateData.event_type === 'brief.completed' ||
		templateData.event_type === 'brief.failed' ||
		(typeof templateData.brief_id === 'string' && typeof templateData.brief_date === 'string')
	);
}

/** Admin email campaigns (and their test sends) are marketing email. */
export function isMarketingEmail(email: EmailRow): boolean {
	const templateData = templateDataOf(email);
	return (
		email.category === 'campaign' ||
		email.category === 'campaign_test' ||
		templateData.category === 'campaign' ||
		templateData.campaign_type === 'marketing'
	);
}

export function suppressionScopeFor(email: EmailRow): SuppressionScope {
	if (isDailyBriefEmail(email)) return 'daily_brief';
	if (isMarketingEmail(email)) return 'marketing';
	return 'lifecycle';
}
