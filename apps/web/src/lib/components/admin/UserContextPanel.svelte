<!-- apps/web/src/lib/components/admin/UserContextPanel.svelte -->
<script lang="ts">
	import {
		ChevronDown,
		ChevronUp,
		User,
		Briefcase,
		Activity,
		Clock,
		Star,
		MessageSquare,
		Phone,
		Globe,
		DollarSign,
		Zap,
		Target,
		BookOpen,
		Settings,
		TriangleAlert,
		Compass,
		Copy,
		Check,
		Mail,
		AlertCircle,
		CheckCircle,
		Eye,
		EyeOff,
		Send,
		Package
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { EmailGenerationContext } from '$lib/services/email-generation-service';

	export let userContext: EmailGenerationContext['userInfo'];
	export let expanded = true;

	let copyButtonState: 'idle' | 'success' = 'idle';
	let expandedEmails = new Set<string>();

	function toggleExpanded() {
		expanded = !expanded;
	}

	function toggleEmailExpanded(emailId: string) {
		if (expandedEmails.has(emailId)) {
			expandedEmails.delete(emailId);
		} else {
			expandedEmails.add(emailId);
		}
		expandedEmails = expandedEmails; // Trigger reactivity
	}

	function formatDate(dateString: string | null): string {
		if (!dateString) return 'N/A';
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatDateTime(dateString: string | null): string {
		if (!dateString) return 'N/A';
		return new Date(dateString).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function getSubscriptionBadgeClass(status: string | null): string {
		switch (status) {
			case 'active':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
			case 'trialing':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
			case 'past_due':
				return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
			case 'beta':
				return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
		}
	}

	function getBetaTierBadgeClass(tier: string | null): string {
		switch (tier?.toLowerCase()) {
			case 'vip':
			case 'premium':
				return 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white';
			case 'early_access':
				return 'bg-indigo-500 text-white';
			default:
				return 'bg-blue-500 text-white';
		}
	}

	function getEmailStatusBadgeClass(status: string): string {
		switch (status) {
			case 'sent':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
			case 'delivered':
				return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
			case 'failed':
				return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
			case 'bounced':
				return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
			case 'complaint':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
			case 'pending':
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
		}
	}

	function truncateEmailBody(body: string, maxLength: number = 100): string {
		if (body.length <= maxLength) return body;
		return body.substring(0, maxLength) + '...';
	}

	function formatUserContextAsMarkdown(): string {
		const lines: string[] = [];

		// Title
		lines.push('# User Context Report');
		lines.push('');
		lines.push(`**Generated**: ${new Date().toLocaleString()}`);
		lines.push('');

		// Basic Information
		lines.push('## Basic Information');
		lines.push('');
		lines.push(`- **Name**: ${userContext.basic.name || 'Not provided'}`);
		lines.push(`- **Email**: ${userContext.basic.email}`);
		lines.push(`- **User ID**: ${userContext.basic.id}`);
		lines.push(`- **Member Since**: ${formatDate(userContext.basic.created_at)}`);
		lines.push(`- **Subscription Status**: ${userContext.basic.subscription_status || 'Free'}`);
		if (userContext.basic.subscription_plan_id) {
			lines.push(`- **Subscription Plan ID**: ${userContext.basic.subscription_plan_id}`);
		}
		if (userContext.basic.last_visit) {
			lines.push(`- **Last Visit**: ${formatDate(userContext.basic.last_visit)}`);
		}
		lines.push(`- **Admin**: ${userContext.basic.is_admin ? 'Yes' : 'No'}`);
		lines.push('');

		// Beta Program Information
		if (userContext.beta) {
			lines.push('## Beta Program Details');
			lines.push('');

			lines.push('### Personal Information');
			lines.push(`- **Full Name**: ${userContext.beta.full_name}`);
			lines.push(`- **Email**: ${userContext.beta.email}`);
			if (userContext.beta.company_name) {
				lines.push(`- **Company**: ${userContext.beta.company_name}`);
			}
			if (userContext.beta.job_title) {
				lines.push(`- **Job Title**: ${userContext.beta.job_title}`);
			}
			if (userContext.beta.user_timezone) {
				lines.push(`- **Timezone**: ${userContext.beta.user_timezone}`);
			}
			lines.push('');

			lines.push('### Beta Status');
			lines.push(`- **Beta Tier**: ${userContext.beta.beta_tier || 'Standard'}`);
			if (userContext.beta.access_level) {
				lines.push(`- **Access Level**: ${userContext.beta.access_level}`);
			}
			lines.push(`- **Active**: ${userContext.beta.is_active ? 'Yes' : 'No'}`);
			if (userContext.beta.joined_at) {
				lines.push(`- **Joined Beta**: ${formatDate(userContext.beta.joined_at)}`);
			}
			if (userContext.beta.approved_at) {
				lines.push(`- **Approved**: ${formatDate(userContext.beta.approved_at)}`);
			}
			if (userContext.beta.last_active_at) {
				lines.push(`- **Last Active**: ${formatDateTime(userContext.beta.last_active_at)}`);
			}
			if (userContext.beta.signup_status) {
				lines.push(`- **Signup Status**: ${userContext.beta.signup_status}`);
			}
			lines.push('');

			lines.push('### Engagement Metrics');
			lines.push(
				`- **Total Feedback Submitted**: ${userContext.beta.total_feedback_submitted || 0}`
			);
			lines.push(`- **Total Calls Attended**: ${userContext.beta.total_calls_attended || 0}`);
			lines.push(
				`- **Total Features Requested**: ${userContext.beta.total_features_requested || 0}`
			);
			lines.push('');

			lines.push('### Preferences');
			lines.push(
				`- **Community Access**: ${userContext.beta.wants_community_access ? 'Yes' : 'No'}`
			);
			lines.push(`- **Weekly Calls**: ${userContext.beta.wants_weekly_calls ? 'Yes' : 'No'}`);
			lines.push(
				`- **Feature Updates**: ${userContext.beta.wants_feature_updates ? 'Yes' : 'No'}`
			);
			lines.push('');

			if (userContext.beta.has_lifetime_pricing || userContext.beta.discount_percentage) {
				lines.push('### Pricing & Benefits');
				if (userContext.beta.has_lifetime_pricing) {
					lines.push('- **Lifetime Pricing**: Yes');
				}
				if (userContext.beta.discount_percentage) {
					lines.push(`- **Discount**: ${userContext.beta.discount_percentage}%`);
				}
				lines.push('');
			}

			if (
				userContext.beta.early_access_features &&
				userContext.beta.early_access_features.length > 0
			) {
				lines.push('### Early Access Features');
				userContext.beta.early_access_features.forEach((feature) => {
					lines.push(`- ${feature}`);
				});
				lines.push('');
			}

			if (
				userContext.beta.productivity_tools &&
				userContext.beta.productivity_tools.length > 0
			) {
				lines.push('### Current Productivity Tools');
				userContext.beta.productivity_tools.forEach((tool) => {
					lines.push(`- ${tool}`);
				});
				lines.push('');
			}

			if (userContext.beta.referral_source) {
				lines.push('### Acquisition');
				lines.push(`- **Referral Source**: ${userContext.beta.referral_source}`);
				lines.push('');
			}

			if (userContext.beta.why_interested) {
				lines.push('### Interest & Motivation');
				lines.push('**Why Interested:**');
				lines.push(`> ${userContext.beta.why_interested}`);
				lines.push('');
			}

			if (userContext.beta.biggest_challenge) {
				lines.push('### Challenges');
				lines.push('**Biggest Challenge:**');
				lines.push(`> ${userContext.beta.biggest_challenge}`);
				lines.push('');
			}
		}

		// Activity Summary
		lines.push('## Activity Summary (Last 30 Days)');
		lines.push('');
		lines.push(`- **Projects**: ${userContext.activity.project_count}`);
		lines.push(`- **Tasks Created**: ${userContext.activity.tasks_created}`);
		lines.push(`- **Tasks Completed**: ${userContext.activity.tasks_completed}`);
		lines.push(`- **Brain Dumps**: ${userContext.activity.brain_dumps_count}`);
		lines.push(`- **Daily Briefs**: ${userContext.activity.daily_briefs_count}`);
		lines.push('');

		if (userContext.activity.recent_projects.length > 0) {
			lines.push('### Recent Projects');
			userContext.activity.recent_projects.forEach((project) => {
				lines.push(`- **${project.title}** (Updated: ${formatDate(project.updated_at)})`);
			});
			lines.push('');
		}

		// Onboarding Information
		if (userContext.onboarding) {
			lines.push('## Onboarding Information');
			lines.push('');

			if (userContext.onboarding.completedAt) {
				lines.push(`**Completed**: ${formatDate(userContext.onboarding.completedAt)}`);
				lines.push('');
			}

			if (userContext.onboarding.projects) {
				lines.push('### Current Projects & Initiatives');
				lines.push(userContext.onboarding.projects);
				lines.push('');
			}

			if (userContext.onboarding.workStyle) {
				lines.push('### Work Style & Preferences');
				lines.push(userContext.onboarding.workStyle);
				lines.push('');
			}

			if (userContext.onboarding.challenges) {
				lines.push('### Current Challenges & Blockers');
				lines.push(userContext.onboarding.challenges);
				lines.push('');
			}

			if (userContext.onboarding.helpFocus) {
				lines.push('### Focus Areas for BuildOS');
				lines.push(userContext.onboarding.helpFocus);
				lines.push('');
			}
		}

		// Email History
		if (userContext.emailHistory && userContext.emailHistory.length > 0) {
			lines.push('## Email History');
			lines.push('');
			lines.push('### Recent Emails Sent');
			lines.push('');

			userContext.emailHistory.forEach((email) => {
				lines.push(`#### ${formatDate(email.created_at || email.sent_at)}`);
				lines.push(`- **Subject**: ${email.subject}`);
				lines.push(`- **From**: ${email.from_name} (${email.from_email})`);
				lines.push(`- **Status**: ${email.recipient_status}`);
				if (email.sent_at) {
					lines.push(`- **Sent**: ${formatDateTime(email.sent_at)}`);
				}
				if (email.delivered_at) {
					lines.push(`- **Delivered**: ${formatDateTime(email.delivered_at)}`);
				}
				if (email.opened_at) {
					lines.push(`- **First Opened**: ${formatDateTime(email.opened_at)}`);
				}
				if (email.open_count && email.open_count > 0) {
					lines.push(`- **Open Count**: ${email.open_count} times`);
				}
				if (email.last_opened_at) {
					lines.push(`- **Last Opened**: ${formatDateTime(email.last_opened_at)}`);
				}
				if (email.error_message) {
					lines.push(`- **Error**: ${email.error_message}`);
				}
				lines.push(`- **Preview**: ${truncateEmailBody(email.content, 200)}`);
				lines.push('');
			});
		}

		return lines.join('\n');
	}

	async function copyUserContext() {
		try {
			const markdown = formatUserContextAsMarkdown();
			await navigator.clipboard.writeText(markdown);
			copyButtonState = 'success';
			setTimeout(() => {
				copyButtonState = 'idle';
			}, 2000);
		} catch (error) {
			console.error('Failed to copy user context:', error);
		}
	}
</script>

<div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
	<!-- Header -->
	<div class="flex items-center bg-gray-50 dark:bg-gray-800">
		<Button
			onclick={toggleExpanded}
			class="flex-1 px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
			variant="ghost"
			btnType="container"
			size="sm"
		>
			<div class="flex items-center gap-3">
				<span class="font-medium text-gray-900 dark:text-white">
					{userContext.beta?.full_name || userContext.basic.name || 'User'} Context
				</span>
				{#if userContext.beta}
					<span
						class="px-2 py-0.5 text-xs font-semibold rounded-full {getBetaTierBadgeClass(
							userContext.beta.beta_tier
						)}"
					>
						{userContext.beta.beta_tier || 'Beta Member'}
					</span>
					{#if userContext.beta.has_lifetime_pricing}
						<span
							class="px-2 py-0.5 text-xs font-semibold rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white"
						>
							Lifetime Access
						</span>
					{/if}
				{/if}
			</div>
			{#if expanded}
				<ChevronUp class="w-5 h-5 text-gray-500" />
			{:else}
				<ChevronDown class="w-5 h-5 text-gray-500" />
			{/if}
		</Button>
		<div class="border-l border-gray-200 dark:border-gray-700">
			<Button
				onclick={copyUserContext}
				class="px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
				variant="ghost"
				btnType="container"
				size="sm"
				title="Copy user context as Markdown"
			>
				{#if copyButtonState === 'success'}
					<Check class="w-5 h-5 text-green-500" />
					<span class="text-sm text-green-600 dark:text-green-400">Copied!</span>
				{:else}
					<Copy class="w-5 h-5 text-gray-500" />
					<span class="text-sm text-gray-600 dark:text-gray-400">Copy</span>
				{/if}
			</Button>
		</div>
	</div>

	<!-- Content -->
	{#if expanded}
		<div class="p-4 space-y-4 bg-white dark:bg-gray-900">
			<!-- Basic Info Section -->
			<div class="space-y-2">
				<div
					class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					<User class="w-4 h-4" />
					<span>Basic Information</span>
				</div>
				<div class="pl-6 space-y-1 text-sm">
					<div class="flex justify-between">
						<span class="text-gray-600 dark:text-gray-400">Name:</span>
						<span class="text-gray-900 dark:text-white font-medium">
							{userContext.basic.name || 'Not provided'}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-600 dark:text-gray-400">Email:</span>
						<span class="text-gray-900 dark:text-white font-mono text-xs">
							{userContext.basic.email}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-600 dark:text-gray-400">Member since:</span>
						<span class="text-gray-900 dark:text-white">
							{formatDate(userContext.basic.created_at)}
						</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-gray-600 dark:text-gray-400">Subscription:</span>
						<span
							class="px-2 py-0.5 text-xs font-medium rounded-full {getSubscriptionBadgeClass(
								userContext.basic.subscription_status
							)}"
						>
							{userContext.basic.subscription_status || 'Free'}
						</span>
					</div>
					{#if userContext.basic.last_visit}
						<div class="flex justify-between">
							<span class="text-gray-600 dark:text-gray-400">Last active:</span>
							<span class="text-gray-900 dark:text-white">
								{formatDate(userContext.basic.last_visit)}
							</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Beta Info Section -->
			{#if userContext.beta}
				<div class="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
					<div
						class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						<Star class="w-4 h-4" />
						<span>Beta Program Details</span>
					</div>

					<!-- Key Info Grid -->
					<div class="grid grid-cols-2 gap-3 pl-6">
						{#if userContext.beta.full_name}
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">
									Full Name
								</div>
								<div class="text-sm font-medium text-gray-900 dark:text-white">
									{userContext.beta.full_name}
								</div>
							</div>
						{/if}
						{#if userContext.beta.email}
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">
									Beta Email
								</div>
								<div class="text-sm font-mono text-gray-900 dark:text-white">
									{userContext.beta.email}
								</div>
							</div>
						{/if}
						{#if userContext.beta.company_name}
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">Company</div>
								<div class="text-sm font-medium text-gray-900 dark:text-white">
									{userContext.beta.company_name}
								</div>
							</div>
						{/if}
						{#if userContext.beta.job_title}
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">Role</div>
								<div class="text-sm font-medium text-gray-900 dark:text-white">
									{userContext.beta.job_title}
								</div>
							</div>
						{/if}
						{#if userContext.beta.user_timezone}
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">
									<Globe class="w-3 h-3 inline" /> Timezone
								</div>
								<div class="text-sm font-medium text-gray-900 dark:text-white">
									{userContext.beta.user_timezone}
								</div>
							</div>
						{/if}
						{#if userContext.beta.joined_at}
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">
									Beta Joined
								</div>
								<div class="text-sm font-medium text-gray-900 dark:text-white">
									{formatDate(userContext.beta.joined_at)}
								</div>
							</div>
						{/if}
						{#if userContext.beta.approved_at}
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">Approved</div>
								<div class="text-sm font-medium text-gray-900 dark:text-white">
									{formatDate(userContext.beta.approved_at)}
								</div>
							</div>
						{/if}
						{#if userContext.beta.last_active_at}
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">
									Last Active
								</div>
								<div class="text-sm font-medium text-gray-900 dark:text-white">
									{formatDateTime(userContext.beta.last_active_at)}
								</div>
							</div>
						{/if}
					</div>

					<!-- Preferences and Engagement -->
					<div class="grid grid-cols-2 md:grid-cols-4 gap-2 pl-6 mt-3">
						{#if userContext.beta.wants_community_access !== null}
							<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
								<div class="text-xs text-gray-600 dark:text-gray-400">
									Community
								</div>
								<div
									class="text-sm font-medium {userContext.beta
										.wants_community_access
										? 'text-green-600'
										: 'text-gray-500'}"
								>
									{userContext.beta.wants_community_access ? '✓ Wants' : 'No'}
								</div>
							</div>
						{/if}
						{#if userContext.beta.wants_weekly_calls !== null}
							<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
								<div class="text-xs text-gray-600 dark:text-gray-400">
									Weekly Calls
								</div>
								<div
									class="text-sm font-medium {userContext.beta.wants_weekly_calls
										? 'text-green-600'
										: 'text-gray-500'}"
								>
									{userContext.beta.wants_weekly_calls ? '✓ Yes' : 'No'}
								</div>
							</div>
						{/if}
						{#if userContext.beta.wants_feature_updates !== null}
							<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
								<div class="text-xs text-gray-600 dark:text-gray-400">
									Feature Updates
								</div>
								<div
									class="text-sm font-medium {userContext.beta
										.wants_feature_updates
										? 'text-green-600'
										: 'text-gray-500'}"
								>
									{userContext.beta.wants_feature_updates ? '✓ Yes' : 'No'}
								</div>
							</div>
						{/if}
						{#if userContext.beta.is_active !== null}
							<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
								<div class="text-xs text-gray-600 dark:text-gray-400">Status</div>
								<div
									class="text-sm font-medium {userContext.beta.is_active
										? 'text-green-600'
										: 'text-red-600'}"
								>
									{userContext.beta.is_active ? '✓ Active' : '✗ Inactive'}
								</div>
							</div>
						{/if}
					</div>

					<!-- Engagement Metrics -->
					<div class="grid grid-cols-3 gap-2 pl-6 mt-3">
						{#if userContext.beta.total_feedback_submitted !== null}
							<div
								class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800"
							>
								<div class="flex items-center gap-2">
									<MessageSquare
										class="w-4 h-4 text-blue-600 dark:text-blue-400"
									/>
									<div>
										<div
											class="text-xl font-bold text-blue-600 dark:text-blue-400"
										>
											{userContext.beta.total_feedback_submitted}
										</div>
										<div class="text-xs text-gray-600 dark:text-gray-400">
											Feedback
										</div>
									</div>
								</div>
							</div>
						{/if}
						{#if userContext.beta.total_calls_attended !== null}
							<div
								class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800"
							>
								<div class="flex items-center gap-2">
									<Phone class="w-4 h-4 text-green-600 dark:text-green-400" />
									<div>
										<div
											class="text-xl font-bold text-green-600 dark:text-green-400"
										>
											{userContext.beta.total_calls_attended}
										</div>
										<div class="text-xs text-gray-600 dark:text-gray-400">
											Calls
										</div>
									</div>
								</div>
							</div>
						{/if}
						{#if userContext.beta.total_features_requested !== null}
							<div
								class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800"
							>
								<div class="flex items-center gap-2">
									<Zap class="w-4 h-4 text-purple-600 dark:text-purple-400" />
									<div>
										<div
											class="text-xl font-bold text-purple-600 dark:text-purple-400"
										>
											{userContext.beta.total_features_requested}
										</div>
										<div class="text-xs text-gray-600 dark:text-gray-400">
											Features
										</div>
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Pricing Info -->
					{#if userContext.beta.discount_percentage !== null && userContext.beta.discount_percentage > 0}
						<div class="pl-6 mt-3">
							<div
								class="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800"
							>
								<div class="flex items-center gap-2">
									<DollarSign
										class="w-4 h-4 text-green-600 dark:text-green-400"
									/>
									<span
										class="text-sm font-medium text-green-800 dark:text-green-200"
									>
										{userContext.beta.discount_percentage}% Lifetime Discount
									</span>
								</div>
							</div>
						</div>
					{/if}

					<!-- Early Access Features -->
					{#if userContext.beta.early_access_features && userContext.beta.early_access_features.length > 0}
						<div class="pl-6 mt-3">
							<div class="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">
								Early Access Features:
							</div>
							<div class="flex flex-wrap gap-1">
								{#each userContext.beta.early_access_features as feature}
									<span
										class="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-full font-medium"
									>
										{feature}
									</span>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Productivity Tools -->
					{#if userContext.beta.productivity_tools && userContext.beta.productivity_tools.length > 0}
						<div class="pl-6 mt-3">
							<div class="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">
								Current Tools:
							</div>
							<div class="flex flex-wrap gap-1">
								{#each userContext.beta.productivity_tools as tool}
									<span
										class="px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded"
									>
										{tool}
									</span>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Referral and Status -->
					<div class="grid grid-cols-2 gap-3 pl-6 mt-3">
						{#if userContext.beta.referral_source}
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">
									<Target class="w-3 h-3 inline" /> Referral Source
								</div>
								<div class="text-sm font-medium text-gray-900 dark:text-white">
									{userContext.beta.referral_source}
								</div>
							</div>
						{/if}
						{#if userContext.beta.signup_status}
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">
									Signup Status
								</div>
								<div class="text-sm font-medium text-gray-900 dark:text-white">
									{userContext.beta.signup_status}
								</div>
							</div>
						{/if}
					</div>

					<!-- Interest and Challenges -->
					{#if userContext.beta.why_interested || userContext.beta.biggest_challenge}
						<div class="pl-6 mt-3 space-y-3">
							{#if userContext.beta.why_interested}
								<div>
									<div
										class="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1"
									>
										Why Interested:
									</div>
									<div
										class="text-sm text-gray-900 dark:text-white bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800"
									>
										{userContext.beta.why_interested}
									</div>
								</div>
							{/if}
							{#if userContext.beta.biggest_challenge}
								<div>
									<div
										class="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1"
									>
										Biggest Challenge:
									</div>
									<div
										class="text-sm text-gray-900 dark:text-white bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800"
									>
										{userContext.beta.biggest_challenge}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Onboarding Section -->
			{#if userContext.onboarding}
				<div class="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
					<div
						class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						<BookOpen class="w-4 h-4" />
						<span>Onboarding Information</span>
						{#if userContext.onboarding.completedAt}
							<span class="text-xs text-green-600 dark:text-green-400">
								✓ Completed {formatDate(userContext.onboarding.completedAt)}
							</span>
						{/if}
					</div>

					<div class="pl-6 space-y-3">
						{#if userContext.onboarding.projects}
							<div>
								<div
									class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 font-medium mb-1"
								>
									<Briefcase class="w-3 h-3" />
									Current Projects & Initiatives:
								</div>
								<div
									class="text-sm text-gray-900 dark:text-white bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800"
								>
									{userContext.onboarding.projects}
								</div>
							</div>
						{/if}

						{#if userContext.onboarding.workStyle}
							<div>
								<div
									class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 font-medium mb-1"
								>
									<Settings class="w-3 h-3" />
									Work Style & Preferences:
								</div>
								<div
									class="text-sm text-gray-900 dark:text-white bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800"
								>
									{userContext.onboarding.workStyle}
								</div>
							</div>
						{/if}

						{#if userContext.onboarding.challenges}
							<div>
								<div
									class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 font-medium mb-1"
								>
									<TriangleAlert class="w-3 h-3" />
									Current Challenges & Blockers:
								</div>
								<div
									class="text-sm text-gray-900 dark:text-white bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800"
								>
									{userContext.onboarding.challenges}
								</div>
							</div>
						{/if}

						{#if userContext.onboarding.helpFocus}
							<div>
								<div
									class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 font-medium mb-1"
								>
									<Compass class="w-3 h-3" />
									Focus Areas for BuildOS:
								</div>
								<div
									class="text-sm text-gray-900 dark:text-white bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border border-purple-200 dark:border-purple-800"
								>
									{userContext.onboarding.helpFocus}
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Activity Section -->
			<div class="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
				<div
					class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					<Activity class="w-4 h-4" />
					<span>Activity Summary (Last 30 days)</span>
				</div>
				<div class="pl-6 space-y-1 text-sm">
					<div class="grid grid-cols-2 gap-2">
						<div class="flex justify-between">
							<span class="text-gray-600 dark:text-gray-400">Projects:</span>
							<span class="text-gray-900 dark:text-white font-medium">
								{userContext.activity.project_count}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600 dark:text-gray-400">Brain dumps:</span>
							<span class="text-gray-900 dark:text-white font-medium">
								{userContext.activity.brain_dumps_count}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600 dark:text-gray-400">Tasks created:</span>
							<span class="text-gray-900 dark:text-white font-medium">
								{userContext.activity.tasks_created}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600 dark:text-gray-400">Tasks done:</span>
							<span class="text-gray-900 dark:text-white font-medium">
								{userContext.activity.tasks_completed}
							</span>
						</div>
					</div>

					{#if userContext.activity.recent_projects.length > 0}
						<div class="mt-3">
							<span class="text-gray-600 dark:text-gray-400 text-xs block mb-1"
								>Recent Projects:</span
							>
							<ul class="space-y-1">
								{#each userContext.activity.recent_projects as project}
									<li
										class="text-xs bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded flex justify-between"
									>
										<span
											class="text-gray-900 dark:text-white font-medium truncate flex-1"
										>
											{project.title}
										</span>
										<span
											class="text-gray-500 dark:text-gray-400 ml-2 whitespace-nowrap"
										>
											{formatDate(project.updated_at)}
										</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			</div>

			<!-- Email History Section -->
			{#if userContext.emailHistory && userContext.emailHistory.length > 0}
				<div class="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
					<div
						class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						<Mail class="w-4 h-4" />
						<span>Email History</span>
						<span class="text-xs text-gray-500 dark:text-gray-400">
							({userContext.emailHistory.length} recent • newest first)
						</span>
					</div>
					<div class="pl-6 space-y-2">
						{#each userContext.emailHistory.slice(0, 5) as email}
							<div
								class="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
							>
								<Button
									onclick={() => toggleEmailExpanded(email.id)}
									class="w-full p-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer text-left group"
									variant="ghost"
									btnType="container"
									size="sm"
									title="Click to {expandedEmails.has(email.id)
										? 'collapse'
										: 'expand'} email"
								>
									<div class="flex items-start justify-between mb-2">
										<div class="flex-1">
											<div class="flex items-center gap-2 mb-1">
												{#if expandedEmails.has(email.id)}
													<ChevronUp
														class="w-4 h-4 text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300"
													/>
												{:else}
													<ChevronDown
														class="w-4 h-4 text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300"
													/>
												{/if}
												<span
													class="text-sm font-medium text-gray-900 dark:text-white"
												>
													{email.subject}
												</span>
												<span
													class="px-2 py-0.5 text-xs rounded-full {getEmailStatusBadgeClass(
														email.recipient_status
													)}"
												>
													{email.recipient_status}
												</span>
												{#if email.category}
													<span
														class="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700"
													>
														{email.category}
													</span>
												{/if}
											</div>
											<div
												class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 pl-5"
											>
												<span>
													<Send class="w-3 h-3 inline mr-1" />
													Sent: {formatDateTime(
														email.sent_at || email.created_at
													)}
												</span>
												{#if email.delivered_at}
													<span>
														<Package class="w-3 h-3 inline mr-1" />
														{formatDate(email.delivered_at)}
													</span>
												{/if}
											</div>
										</div>
										<div class="flex items-center gap-2">
											{#if email.opened_at}
												<div class="text-center">
													<Eye
														class="w-4 h-4 text-green-500 dark:text-green-400"
													/>
													{#if email.open_count && email.open_count > 1}
														<span
															class="text-xs text-green-600 dark:text-green-400"
														>
															{email.open_count}x
														</span>
													{/if}
												</div>
											{:else if email.delivered_at}
												<EyeOff
													class="w-4 h-4 text-gray-400 dark:text-gray-500"
												/>
											{:else if email.recipient_status === 'failed' && email.error_message}
												<AlertCircle
													class="w-4 h-4 text-red-500 dark:text-red-400"
												/>
											{:else if email.recipient_status === 'delivered'}
												<CheckCircle
													class="w-4 h-4 text-green-500 dark:text-green-400"
												/>
											{/if}
										</div>
									</div>

									{#if email.opened_at}
										<div
											class="pl-5 mb-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-2 rounded"
										>
											<Eye class="w-3 h-3 inline mr-1" />
											First opened: {formatDateTime(email.opened_at)}
											{#if email.last_opened_at && email.last_opened_at !== email.opened_at}
												• Last: {formatDateTime(email.last_opened_at)}
											{/if}
											{#if email.open_count && email.open_count > 1}
												• Opened {email.open_count} times
											{/if}
										</div>
									{/if}

									{#if !expandedEmails.has(email.id)}
										<div
											class="pl-5 text-xs text-gray-600 dark:text-gray-300 line-clamp-2"
										>
											{truncateEmailBody(email.content, 150)}
										</div>
									{/if}

									{#if email.error_message}
										<div
											class="pl-5 mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded"
										>
											<AlertCircle class="w-3 h-3 inline mr-1" />
											{email.error_message}
										</div>
									{/if}

									<div class="pl-5 mt-2 text-xs text-gray-500 dark:text-gray-400">
										From: {email.from_name} ({email.from_email})
									</div>
								</Button>

								{#if expandedEmails.has(email.id)}
									<div
										class="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
									>
										<div class="p-4 space-y-3">
											<div class="flex items-center justify-between">
												<div
													class="text-sm font-medium text-gray-700 dark:text-gray-300"
												>
													Full Email Content
												</div>
												<Button
													onclick={() => {
														navigator.clipboard.writeText(
															email.content
														);
													}}
													class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors min-h-0 min-w-0"
													variant="ghost"
													size="sm"
													btnType="container"
												>
													<Copy class="w-3 h-3 inline mr-1" />
													Copy Email
												</Button>
											</div>
											<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
												<pre
													class="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans">{email.content}</pre>
											</div>

											<div class="grid grid-cols-2 gap-4 text-xs">
												<div>
													<span
														class="font-medium text-gray-600 dark:text-gray-400"
														>Email ID:</span
													>
													<span
														class="ml-2 font-mono text-gray-800 dark:text-gray-200"
														>{email.id}</span
													>
												</div>
												<div>
													<span
														class="font-medium text-gray-600 dark:text-gray-400"
														>To:</span
													>
													<span
														class="ml-2 text-gray-800 dark:text-gray-200"
														>{email.recipient_email}</span
													>
												</div>
												{#if email.category}
													<div>
														<span
															class="font-medium text-gray-600 dark:text-gray-400"
															>Category:</span
														>
														<span
															class="ml-2 text-gray-800 dark:text-gray-200"
															>{email.category}</span
														>
													</div>
												{/if}
												<div>
													<span
														class="font-medium text-gray-600 dark:text-gray-400"
														>Created:</span
													>
													<span
														class="ml-2 text-gray-800 dark:text-gray-200"
														>{formatDateTime(email.created_at)}</span
													>
												</div>
											</div>
										</div>
									</div>
								{/if}
							</div>
						{/each}
						{#if userContext.emailHistory.length > 5}
							<div class="text-xs text-gray-500 dark:text-gray-400 text-center">
								... and {userContext.emailHistory.length - 5} more emails
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
