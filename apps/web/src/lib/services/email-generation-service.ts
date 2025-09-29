// src/lib/services/email-generation-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { SmartLLMService } from './smart-llm-service';
import type { Database } from '@buildos/shared-types';
import { ActivityLogger } from '$lib/utils/activityLogger';

export interface UserBasicInfo {
	id: string;
	email: string;
	name: string | null;
	created_at: string;
	subscription_status: string | null;
	subscription_plan_id: string | null;
	last_visit: string | null;
	is_admin: boolean;
}

export interface BetaUserInfo {
	// From beta_members
	full_name: string;
	email: string;
	beta_tier: string | null;
	access_level: string | null;
	company_name: string | null;
	job_title: string | null;
	joined_at: string | null;
	user_timezone: string | null;
	wants_community_access: boolean | null;
	wants_feature_updates: boolean | null;
	wants_weekly_calls: boolean | null;
	total_feedback_submitted: number | null;
	total_calls_attended: number | null;
	total_features_requested: number | null;
	early_access_features: string[] | null;
	has_lifetime_pricing: boolean | null;
	discount_percentage: number | null;
	is_active: boolean | null;
	last_active_at: string | null;
	// From beta_signups
	why_interested: string | null;
	biggest_challenge: string | null;
	productivity_tools: string[] | null;
	referral_source: string | null;
	signup_status: string | null;
	approved_at: string | null;
}

export interface UserActivitySummary {
	project_count: number;
	tasks_created: number;
	tasks_completed: number;
	brain_dumps_count: number;
	daily_briefs_count: number;
	phases_generated_count: number;
	notes_count: number;
	calendar_connected: boolean;
	recent_projects: Array<{
		id: string;
		title: string;
		updated_at: string;
	}>;
}

export interface UserOnboardingData {
	projects: string | null;
	workStyle: string | null;
	challenges: string | null;
	helpFocus: string | null;
	completedAt: string | null;
}

export interface EmailHistoryItem {
	id: string;
	subject: string;
	content: string;
	from_name: string;
	from_email: string;
	sent_at: string | null;
	created_at: string | null;
	category: string | null;
	// Recipient tracking data
	recipient_email: string;
	recipient_status: string;
	delivered_at: string | null;
	opened_at: string | null;
	last_opened_at: string | null;
	open_count: number | null;
	error_message: string | null;
}

export interface EmailGenerationContext {
	userInfo: {
		basic: UserBasicInfo;
		beta?: BetaUserInfo;
		activity: UserActivitySummary;
		onboarding?: UserOnboardingData;
		emailHistory?: EmailHistoryItem[];
	};
	instructions: string;
	emailType?: 'welcome' | 'follow-up' | 'feature' | 'feedback' | 'custom';
	tone?: 'professional' | 'friendly' | 'casual';
}

export interface EmailTemplate {
	id: string;
	name: string;
	description: string;
	prompt_template: string;
	default_tone: 'professional' | 'friendly' | 'casual';
	created_at: string;
}

const EMAIL_CONFIG = {
	llm: {
		model: 'gpt-5-nano', // Using the cheapest GPT-5 model
		maxTokens: 500,
		temperature: 0.7
	},
	limits: {
		maxEmailsPerHour: 50,
		maxInstructionLength: 1000,
		maxEmailLength: 2000
	},
	defaults: {
		tone: 'friendly' as const,
		includeActivityDays: 30,
		includeProjectLimit: 3
	}
};

export class EmailGenerationService {
	private supabase: SupabaseClient<Database>;
	private llmService: SmartLLMService;
	private activityLogger: ActivityLogger;

	constructor(supabase: SupabaseClient<Database>, openRouterApiKey?: string) {
		this.supabase = supabase;
		this.activityLogger = new ActivityLogger(supabase);
		// Use provided API key or try to get from environment

		this.llmService = new SmartLLMService({
			httpReferer: 'https://buildos.dev',
			appName: 'BuildOS Email Service',
			supabase
		});
	}

	async getBetaMemberContext(
		email: string,
		name: string | null
	): Promise<EmailGenerationContext['userInfo']> {
		// Fetch beta member, signup info, and email history in parallel
		const [betaMemberResult, betaSignupResult, emailHistoryResult] = await Promise.all([
			this.supabase.from('beta_members').select('*').eq('email', email).single(),
			this.supabase.from('beta_signups').select('*').eq('email', email).single(),
			// Email history - get emails sent to this beta member from email_recipients joined with emails
			this.supabase
				.from('email_recipients')
				.select(
					`
					recipient_email,
					status,
					delivered_at,
					opened_at,
					last_opened_at,
					open_count,
					error_message,
					emails!inner (
						id,
						subject,
						content,
						from_name,
						from_email,
						sent_at,
						created_at,
						category
					)
				`
				)
				.eq('recipient_email', email)
				.order('sent_at', { ascending: false, foreignTable: 'emails' })
				.limit(10)
		]);

		const { data: betaMember } = betaMemberResult;
		const { data: betaSignup } = betaSignupResult;
		const { data: emailHistory } = emailHistoryResult;

		// Create a minimal context for beta members without user accounts
		const basic: UserBasicInfo = {
			id: 'beta-only',
			email: email,
			name: betaMember?.full_name || name,
			created_at: betaMember?.joined_at || new Date().toISOString(),
			subscription_status: 'beta',
			subscription_plan_id: null,
			last_visit: betaMember?.last_active_at || null,
			is_admin: false
		};

		// Process beta info if member exists
		let beta: BetaUserInfo | undefined;
		if (betaMember) {
			beta = {
				// From beta_members
				full_name: betaMember.full_name,
				email: betaMember.email,
				beta_tier: betaMember.beta_tier,
				access_level: betaMember.access_level,
				company_name: betaMember.company_name,
				job_title: betaMember.job_title,
				joined_at: betaMember.joined_at,
				user_timezone: betaMember.user_timezone,
				wants_community_access: betaMember.wants_community_access,
				wants_feature_updates: betaMember.wants_feature_updates,
				wants_weekly_calls: betaMember.wants_weekly_calls,
				total_feedback_submitted: betaMember.total_feedback_submitted,
				total_calls_attended: betaMember.total_calls_attended,
				total_features_requested: betaMember.total_features_requested,
				early_access_features: betaMember.early_access_features,
				has_lifetime_pricing: betaMember.has_lifetime_pricing,
				discount_percentage: betaMember.discount_percentage,
				is_active: betaMember.is_active,
				last_active_at: betaMember.last_active_at,
				// From beta_signups (if available)
				why_interested: betaSignup?.why_interested || null,
				biggest_challenge: betaSignup?.biggest_challenge || null,
				productivity_tools: betaSignup?.productivity_tools || null,
				referral_source: betaSignup?.referral_source || null,
				signup_status: betaSignup?.signup_status || null,
				approved_at: betaSignup?.approved_at || null
			};
		}

		// Minimal activity for beta-only members
		const activity: UserActivitySummary = {
			project_count: 0,
			tasks_created: 0,
			tasks_completed: 0,
			brain_dumps_count: 0,
			daily_briefs_count: 0,
			phases_generated_count: 0,
			notes_count: 0,
			calendar_connected: false,
			recent_projects: []
		};

		// Format email history from the joined data and ensure proper sorting
		const formattedEmailHistory: EmailHistoryItem[] | undefined = emailHistory
			? emailHistory
					.map((record: any) => ({
						id: record.emails.id,
						subject: record.emails.subject,
						content: record.emails.content,
						from_name: record.emails.from_name,
						from_email: record.emails.from_email,
						sent_at: record.emails.sent_at,
						created_at: record.emails.created_at,
						category: record.emails.category,
						// Recipient tracking data
						recipient_email: record.recipient_email,
						recipient_status: record.status,
						delivered_at: record.delivered_at,
						opened_at: record.opened_at,
						last_opened_at: record.last_opened_at,
						open_count: record.open_count,
						error_message: record.error_message
					}))
					.sort((a, b) => {
						// Sort by sent_at first, fallback to created_at if sent_at is null
						const aDate = new Date(a.sent_at || a.created_at || 0);
						const bDate = new Date(b.sent_at || b.created_at || 0);
						return bDate.getTime() - aDate.getTime(); // Descending order (newest first)
					})
			: undefined;

		return { basic, beta, activity, emailHistory: formattedEmailHistory };
	}

	async getUserContext(userId: string): Promise<EmailGenerationContext['userInfo']> {
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

		// First, get user to know their email for beta_signups query
		const { data: user, error: userError } = await this.supabase
			.from('users')
			.select('*')
			.eq('id', userId)
			.single();

		if (userError || !user) {
			throw new Error(`Failed to fetch user: ${userError?.message}`);
		}

		// Execute ALL remaining queries in parallel for maximum performance
		const [
			onboardingResult,
			betaMemberResult,
			betaSignupResult,
			projectsResult,
			tasksResult,
			brainDumpsResult,
			dailyBriefsResult,
			phaseGenerationsResult,
			notesResult,
			calendarTokensResult,
			emailHistoryResult
		] = await Promise.all([
			// Onboarding context
			this.supabase
				.from('user_context')
				.select(
					'input_projects, input_work_style, input_challenges, input_help_focus, onboarding_completed_at'
				)
				.eq('user_id', userId)
				.single(),

			// Beta member info (using the fetched user's email)
			this.supabase.from('beta_members').select('*').eq('email', user.email).single(),

			// Beta signup info (using user email)
			this.supabase.from('beta_signups').select('*').eq('email', user.email).single(),

			// Recent projects
			this.supabase
				.from('projects')
				.select('id, name, updated_at')
				.eq('user_id', userId)
				.order('updated_at', { ascending: false })
				.limit(EMAIL_CONFIG.defaults.includeProjectLimit),

			// Task metrics
			this.supabase
				.from('tasks')
				.select('id, status, created_at')
				.eq('user_id', userId)
				.gte('created_at', thirtyDaysAgoISO),

			// Brain dumps count
			this.supabase
				.from('brain_dumps')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.gte('created_at', thirtyDaysAgoISO),

			// Daily briefs count
			this.supabase
				.from('daily_briefs')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.gte('created_at', thirtyDaysAgoISO),

			// Phase generations count
			this.supabase
				.from('project_phases_generation')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId),

			// Notes count
			this.supabase
				.from('notes')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.gte('created_at', thirtyDaysAgoISO),

			// Calendar connection
			this.supabase
				.from('user_calendar_tokens')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId),
			// Email history - get emails sent to this user from email_recipients joined with emails
			this.supabase
				.from('email_recipients')
				.select(
					`
					recipient_email,
					status,
					delivered_at,
					opened_at,
					last_opened_at,
					open_count,
					error_message,
					emails!inner (
						id,
						subject,
						content,
						from_name,
						from_email,
						sent_at,
						created_at,
						category
					)
				`
				)
				.or(`recipient_email.eq.${user.email},recipient_id.eq.${userId}`)
				.order('sent_at', { ascending: false, foreignTable: 'emails' })
				.limit(10)
		]);

		const { data: userContext } = onboardingResult;
		const { data: betaMember } = betaMemberResult;
		const { data: betaSignup } = betaSignupResult;
		const { data: projects } = projectsResult;
		const { data: tasks } = tasksResult;
		const { count: brainDumpsCount } = brainDumpsResult;
		const { count: dailyBriefsCount } = dailyBriefsResult;
		const { count: phaseGenerationsCount } = phaseGenerationsResult;
		const { count: notesCount } = notesResult;
		const { count: calendarTokensCount } = calendarTokensResult;
		const { data: emailHistory } = emailHistoryResult;

		const basic: UserBasicInfo = {
			id: user.id,
			email: user.email,
			name: user.name,
			created_at: user.created_at,
			subscription_status: user.subscription_status,
			subscription_plan_id: user.subscription_plan_id,
			last_visit: user.last_visit,
			is_admin: user.is_admin
		};

		// Process beta info if member exists
		let beta: BetaUserInfo | undefined;
		if (betaMember) {
			beta = {
				// From beta_members
				full_name: betaMember.full_name,
				email: betaMember.email,
				beta_tier: betaMember.beta_tier,
				access_level: betaMember.access_level,
				company_name: betaMember.company_name,
				job_title: betaMember.job_title,
				joined_at: betaMember.joined_at,
				user_timezone: betaMember.user_timezone,
				wants_community_access: betaMember.wants_community_access,
				wants_feature_updates: betaMember.wants_feature_updates,
				wants_weekly_calls: betaMember.wants_weekly_calls,
				total_feedback_submitted: betaMember.total_feedback_submitted,
				total_calls_attended: betaMember.total_calls_attended,
				total_features_requested: betaMember.total_features_requested,
				early_access_features: betaMember.early_access_features,
				has_lifetime_pricing: betaMember.has_lifetime_pricing,
				discount_percentage: betaMember.discount_percentage,
				is_active: betaMember.is_active,
				last_active_at: betaMember.last_active_at,
				// From beta_signups (if available)
				why_interested: betaSignup?.why_interested || null,
				biggest_challenge: betaSignup?.biggest_challenge || null,
				productivity_tools: betaSignup?.productivity_tools || null,
				referral_source: betaSignup?.referral_source || null,
				signup_status: betaSignup?.signup_status || null,
				approved_at: betaSignup?.approved_at || null
			};
		}

		// Calculate task metrics
		const tasksCreated = tasks?.length || 0;
		const tasksCompleted = tasks?.filter((t) => t.status === 'done').length || 0;

		const activity: UserActivitySummary = {
			project_count: projects?.length || 0,
			tasks_created: tasksCreated,
			tasks_completed: tasksCompleted,
			brain_dumps_count: brainDumpsCount || 0,
			daily_briefs_count: dailyBriefsCount || 0,
			phases_generated_count: phaseGenerationsCount || 0,
			notes_count: notesCount || 0,
			calendar_connected: (calendarTokensCount || 0) > 0,
			recent_projects:
				projects?.map((p) => ({
					id: p.id,
					title: p.name,
					updated_at: p.updated_at
				})) || []
		};

		// Add onboarding data if available
		const onboarding: UserOnboardingData | undefined = userContext
			? {
					projects: userContext.input_projects,
					workStyle: userContext.input_work_style,
					challenges: userContext.input_challenges,
					helpFocus: userContext.input_help_focus,
					completedAt: userContext.onboarding_completed_at
				}
			: undefined;

		// Format email history from the joined data and ensure proper sorting
		const formattedEmailHistory: EmailHistoryItem[] | undefined = emailHistory
			? emailHistory
					.map((record: any) => ({
						id: record.emails.id,
						subject: record.emails.subject,
						content: record.emails.content,
						from_name: record.emails.from_name,
						from_email: record.emails.from_email,
						sent_at: record.emails.sent_at,
						created_at: record.emails.created_at,
						category: record.emails.category,
						// Recipient tracking data
						recipient_email: record.recipient_email,
						recipient_status: record.status,
						delivered_at: record.delivered_at,
						opened_at: record.opened_at,
						last_opened_at: record.last_opened_at,
						open_count: record.open_count,
						error_message: record.error_message
					}))
					.sort((a, b) => {
						// Sort by sent_at first, fallback to created_at if sent_at is null
						const aDate = new Date(a.sent_at || a.created_at || 0);
						const bDate = new Date(b.sent_at || b.created_at || 0);
						return bDate.getTime() - aDate.getTime(); // Descending order (newest first)
					})
			: undefined;

		return { basic, beta, activity, onboarding, emailHistory: formattedEmailHistory };
	}

	private formatUserContext(userInfo: EmailGenerationContext['userInfo']): string {
		let context = `User Information:\n`;
		context += `- Name: ${userInfo.basic.name || 'Not provided'}\n`;
		context += `- Email: ${userInfo.basic.email}\n`;
		context += `- Member since: ${new Date(userInfo.basic.created_at).toLocaleDateString()}\n`;
		context += `- Subscription: ${userInfo.basic.subscription_status || 'Free'}\n`;

		if (userInfo.basic.last_visit) {
			context += `- Last active: ${new Date(userInfo.basic.last_visit).toLocaleDateString()}\n`;
		}

		if (userInfo.onboarding) {
			context += `\nOnboarding Information:\n`;
			if (userInfo.onboarding.projects) {
				context += `- Current Projects: ${userInfo.onboarding.projects}\n`;
			}
			if (userInfo.onboarding.workStyle) {
				context += `- Work Style: ${userInfo.onboarding.workStyle}\n`;
			}
			if (userInfo.onboarding.challenges) {
				context += `- Challenges: ${userInfo.onboarding.challenges}\n`;
			}
			if (userInfo.onboarding.helpFocus) {
				context += `- Focus Areas: ${userInfo.onboarding.helpFocus}\n`;
			}
			if (userInfo.onboarding.completedAt) {
				context += `- Onboarding Completed: ${new Date(userInfo.onboarding.completedAt).toLocaleDateString()}\n`;
			}
		}

		if (userInfo.beta) {
			context += `\nBeta Program:\n`;
			context += `- Tier: ${userInfo.beta.beta_tier || 'Standard'}\n`;
			if (userInfo.beta.company_name) {
				context += `- Company: ${userInfo.beta.company_name}\n`;
			}
			if (userInfo.beta.job_title) {
				context += `- Role: ${userInfo.beta.job_title}\n`;
			}
			if (userInfo.beta.biggest_challenge) {
				context += `- Main challenge: ${userInfo.beta.biggest_challenge}\n`;
			}
			if (userInfo.beta.total_feedback_submitted) {
				context += `- Feedback submitted: ${userInfo.beta.total_feedback_submitted} times\n`;
			}
		}

		context += `\nActivity (Last 30 days):\n`;
		context += `- Projects: ${userInfo.activity.project_count}\n`;
		context += `- Tasks created: ${userInfo.activity.tasks_created}\n`;
		context += `- Tasks completed: ${userInfo.activity.tasks_completed}\n`;
		context += `- Brain dumps: ${userInfo.activity.brain_dumps_count}\n`;
		context += `- Daily briefs: ${userInfo.activity.daily_briefs_count}\n`;
		context += `- Phases generated: ${userInfo.activity.phases_generated_count}\n`;
		context += `- Notes created: ${userInfo.activity.notes_count}\n`;
		context += `- Calendar connected: ${userInfo.activity.calendar_connected ? 'Yes' : 'No'}\n`;

		if (userInfo.activity.recent_projects.length > 0) {
			context += `\nRecent Projects:\n`;
			userInfo.activity.recent_projects.forEach((project) => {
				const lastUpdated = new Date(project.updated_at).toLocaleDateString();
				context += `- "${project.title}" (updated ${lastUpdated})\n`;
			});
		}

		return context;
	}

	getDefaultSystemPrompt(context: EmailGenerationContext): string {
		const userContext = this.formatUserContext(context.userInfo);
		const tone = context.tone || EMAIL_CONFIG.defaults.tone;
		const emailType = context.emailType || 'custom';

		return `You are composing a personalized email for a BuildOS user. BuildOS is a productivity platform that helps users manage projects, tasks, and daily workflows with AI assistance.

Generate an email that is ${tone} in tone and focused on ${emailType === 'custom' ? 'the user instructions' : emailType}.

User Context:
${userContext}

Guidelines:
- Keep the email concise and engaging
- Reference specific user activity, the different activity types are:
 - user onboarding
 - beta user info
 - user activity
- Use the user's name if available
- Make the email feel personal, not automated
- Include a clear call-to-action when appropriate
- Sign the email as "DJ" for more personal messages
- Do not include subject line - only the email body`;
	}

	async generateEmail(context: EmailGenerationContext): Promise<string> {
		const systemPrompt = this.getDefaultSystemPrompt(context);
		return this.generateEmailWithCustomPrompt(context, systemPrompt);
	}

	async generateEmailWithCustomPrompt(
		context: EmailGenerationContext,
		customSystemPrompt?: string
	): Promise<string> {
		const systemPrompt = customSystemPrompt || this.getDefaultSystemPrompt(context);

		const userPrompt = `Instructions for this email: ${context.instructions}

Generate the email body now.`;

		try {
			// Use null for user_id when it's a beta-only member (not a valid UUID)
			const userId =
				context.userInfo.basic.id === 'beta-only' ? null : context.userInfo.basic.id;

			const generatedEmail = await this.llmService.generateText({
				prompt: userPrompt,
				userId: userId || 'anonymous',
				profile: 'balanced',
				systemPrompt,
				temperature: EMAIL_CONFIG.llm.temperature,
				maxTokens: EMAIL_CONFIG.llm.maxTokens
			});

			if (!generatedEmail) {
				throw new Error('Failed to generate email content');
			}

			// Validate email length
			if (generatedEmail.length > EMAIL_CONFIG.limits.maxEmailLength) {
				return generatedEmail.substring(0, EMAIL_CONFIG.limits.maxEmailLength) + '...';
			}

			return generatedEmail;
		} catch (error) {
			console.error('Error generating email:', error);
			throw new Error(
				`Email generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	async logGeneratedEmail(
		userId: string,
		recipientEmail: string,
		generatedContent: string,
		instructions: string,
		sent: boolean = false
	): Promise<void> {
		try {
			await this.supabase.from('email_logs').insert({
				to_email: recipientEmail,
				subject: 'Personalized Email',
				body: generatedContent,
				status: sent ? 'sent' : 'draft',
				user_id: userId,
				metadata: {
					generated_by_llm: true,
					generation_prompt: instructions,
					user_id: userId
				}
			});
		} catch (error) {
			console.error('Failed to log email:', error);
		}
	}

	async checkRateLimit(userId: string): Promise<boolean> {
		const oneHourAgo = new Date();
		oneHourAgo.setHours(oneHourAgo.getHours() - 1);

		const { count } = await this.supabase
			.from('email_logs')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId)
			.gte('created_at', oneHourAgo.toISOString());

		return (count || 0) < EMAIL_CONFIG.limits.maxEmailsPerHour;
	}
}
