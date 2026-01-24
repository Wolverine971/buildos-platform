<!-- apps/web/src/lib/components/admin/UserContextPanel.svelte -->
<script lang="ts">
	import {
		ChevronDown,
		ChevronRight,
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
		Package,
		Sparkles,
		Heart,
		TrendingUp,
		TrendingDown,
		Minus,
		Calendar,
		FileText
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { EmailGenerationContext } from '$lib/services/email-generation-service';
	import { toastService } from '$lib/stores/toast.store';
	import { createEventDispatcher } from 'svelte';

	interface Props {
		userContext: EmailGenerationContext['userInfo'];
		expanded?: boolean;
		showActions?: boolean;
	}

	let { userContext, expanded = true, showActions = true }: Props = $props();

	const dispatch = createEventDispatcher<{
		composeEmail: { template: string; instructions: string };
		copyContext: { markdown: string };
	}>();

	let copyButtonState = $state<'idle' | 'success'>('idle');
	let expandedSections = $state<Set<string>>(new Set(['basic', 'activity']));

	// Computed user health score and signals
	let userHealth = $derived(computeUserHealth());
	let engagementLevel = $derived(computeEngagementLevel());

	function computeUserHealth(): {
		score: number;
		status: 'healthy' | 'at-risk' | 'churning' | 'new';
		signals: string[];
	} {
		const signals: string[] = [];
		let score = 50; // Base score

		// Check last visit
		if (userContext.basic.last_visit) {
			const daysSinceVisit = Math.floor(
				(Date.now() - new Date(userContext.basic.last_visit).getTime()) /
					(1000 * 60 * 60 * 24)
			);
			if (daysSinceVisit > 14) {
				score -= 20;
				signals.push(`Inactive ${daysSinceVisit}d`);
			} else if (daysSinceVisit > 7) {
				score -= 10;
				signals.push(`Last seen ${daysSinceVisit}d ago`);
			} else {
				score += 10;
			}
		}

		// Check activity
		const { tasks_created, tasks_completed, agentic_sessions_count, project_count } =
			userContext.activity;

		if (tasks_created > 10) score += 15;
		else if (tasks_created > 5) score += 10;
		else if (tasks_created === 0) {
			score -= 15;
			signals.push('No tasks created');
		}

		if (tasks_completed > 5) score += 10;
		if (agentic_sessions_count > 3) score += 10;
		if (project_count > 0) score += 5;

		// Beta engagement
		if (userContext.beta) {
			if (
				userContext.beta.total_feedback_submitted &&
				userContext.beta.total_feedback_submitted > 0
			)
				score += 10;
			if (userContext.beta.total_calls_attended && userContext.beta.total_calls_attended > 0)
				score += 15;
		}

		// Determine status
		let status: 'healthy' | 'at-risk' | 'churning' | 'new' = 'healthy';
		const memberDays = Math.floor(
			(Date.now() - new Date(userContext.basic.created_at).getTime()) / (1000 * 60 * 60 * 24)
		);

		if (memberDays < 7) {
			status = 'new';
		} else if (score < 30) {
			status = 'churning';
		} else if (score < 50) {
			status = 'at-risk';
		}

		return { score: Math.max(0, Math.min(100, score)), status, signals };
	}

	function computeEngagementLevel(): 'high' | 'medium' | 'low' | 'none' {
		const { tasks_created, agentic_sessions_count, project_count } = userContext.activity;
		const total = tasks_created + agentic_sessions_count + project_count;

		if (total > 20) return 'high';
		if (total > 10) return 'medium';
		if (total > 0) return 'low';
		return 'none';
	}

	function toggleSection(section: string) {
		if (expandedSections.has(section)) {
			expandedSections.delete(section);
		} else {
			expandedSections.add(section);
		}
		expandedSections = expandedSections;
	}

	function formatDate(dateString: string | null): string {
		if (!dateString) return '—';
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatRelativeDate(dateString: string | null): string {
		if (!dateString) return '—';
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays}d ago`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
		return formatDate(dateString);
	}

	function getHealthColor(status: string): string {
		switch (status) {
			case 'healthy':
				return 'text-emerald-600 dark:text-emerald-400';
			case 'at-risk':
				return 'text-amber-600 dark:text-amber-400';
			case 'churning':
				return 'text-red-600 dark:text-red-400';
			case 'new':
				return 'text-blue-600 dark:text-blue-400';
			default:
				return 'text-muted-foreground';
		}
	}

	function getHealthBg(status: string): string {
		switch (status) {
			case 'healthy':
				return 'bg-emerald-500/10 border-emerald-500/30';
			case 'at-risk':
				return 'bg-amber-500/10 border-amber-500/30';
			case 'churning':
				return 'bg-red-500/10 border-red-500/30';
			case 'new':
				return 'bg-blue-500/10 border-blue-500/30';
			default:
				return 'bg-muted border-border';
		}
	}

	function getSubscriptionBadge(status: string | null): { class: string; label: string } {
		switch (status) {
			case 'active':
				return {
					class: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
					label: 'Active'
				};
			case 'trialing':
				return {
					class: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
					label: 'Trial'
				};
			case 'past_due':
				return {
					class: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
					label: 'Past Due'
				};
			case 'beta':
				return {
					class: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
					label: 'Beta'
				};
			default:
				return { class: 'bg-muted text-muted-foreground border-border', label: 'Free' };
		}
	}

	function quickEmail(template: string) {
		let instructions = '';
		switch (template) {
			case 'welcome':
				instructions = `Welcome ${userContext.beta?.full_name || userContext.basic.name || 'them'} to BuildOS. Highlight key features that match their interests and encourage them to start their first project.`;
				break;
			case 'check-in':
				instructions = `Check in on their progress. Reference their ${userContext.activity.project_count} projects and ${userContext.activity.tasks_created} tasks. See if they need help.`;
				break;
			case 'feedback':
				instructions = `Request feedback on their BuildOS experience. Ask about specific features they've used.`;
				break;
			case 're-engage':
				instructions = `Re-engage this user who hasn't been active recently. Highlight new features and offer help getting started again.`;
				break;
		}
		dispatch('composeEmail', { template, instructions });
	}

	function formatUserContextAsMarkdown(): string {
		const lines: string[] = [];
		lines.push(
			`# User Context: ${userContext.beta?.full_name || userContext.basic.name || userContext.basic.email}`
		);
		lines.push('');
		lines.push(`**Generated**: ${new Date().toLocaleString()}`);
		lines.push(`**Health**: ${userHealth.status} (${userHealth.score}/100)`);
		lines.push('');

		lines.push('## Basic Information');
		lines.push(`- **Email**: ${userContext.basic.email}`);
		lines.push(`- **Member Since**: ${formatDate(userContext.basic.created_at)}`);
		lines.push(`- **Subscription**: ${userContext.basic.subscription_status || 'Free'}`);
		lines.push(`- **Last Visit**: ${formatRelativeDate(userContext.basic.last_visit)}`);
		lines.push('');

		if (userContext.beta) {
			lines.push('## Beta Program');
			lines.push(`- **Tier**: ${userContext.beta.beta_tier || 'Standard'}`);
			if (userContext.beta.company_name)
				lines.push(`- **Company**: ${userContext.beta.company_name}`);
			if (userContext.beta.job_title) lines.push(`- **Role**: ${userContext.beta.job_title}`);
			if (userContext.beta.biggest_challenge) {
				lines.push('');
				lines.push(`**Biggest Challenge**: ${userContext.beta.biggest_challenge}`);
			}
			lines.push('');
		}

		lines.push('## Activity (30 days)');
		lines.push(`- Projects: ${userContext.activity.project_count}`);
		lines.push(`- Tasks Created: ${userContext.activity.tasks_created}`);
		lines.push(`- Tasks Completed: ${userContext.activity.tasks_completed}`);
		lines.push(`- Agentic Sessions: ${userContext.activity.agentic_sessions_count}`);
		lines.push(`- Agentic Messages: ${userContext.activity.agentic_messages_count}`);
		lines.push('');

		if (userContext.onboarding) {
			lines.push('## Onboarding Context');
			if (userContext.onboarding.projects)
				lines.push(`- **Projects**: ${userContext.onboarding.projects}`);
			if (userContext.onboarding.challenges)
				lines.push(`- **Challenges**: ${userContext.onboarding.challenges}`);
			if (userContext.onboarding.helpFocus)
				lines.push(`- **Focus**: ${userContext.onboarding.helpFocus}`);
		}

		return lines.join('\n');
	}

	/**
	 * Strip HTML tags and convert to readable plain text
	 */
	function stripHtmlToText(html: string): string {
		// Replace common block elements with newlines
		let text = html
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/p>/gi, '\n\n')
			.replace(/<\/div>/gi, '\n')
			.replace(/<\/li>/gi, '\n')
			.replace(/<\/tr>/gi, '\n')
			.replace(/<\/h[1-6]>/gi, '\n\n');

		// Replace list items with bullets
		text = text.replace(/<li[^>]*>/gi, '• ');

		// Remove all remaining HTML tags
		text = text.replace(/<[^>]+>/g, '');

		// Decode common HTML entities
		text = text
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&rsquo;/g, "'")
			.replace(/&lsquo;/g, "'")
			.replace(/&rdquo;/g, '"')
			.replace(/&ldquo;/g, '"')
			.replace(/&mdash;/g, '—')
			.replace(/&ndash;/g, '–');

		// Clean up excessive whitespace
		text = text
			.replace(/[ \t]+/g, ' ') // Multiple spaces/tabs to single space
			.replace(/\n[ \t]+/g, '\n') // Remove leading whitespace on lines
			.replace(/[ \t]+\n/g, '\n') // Remove trailing whitespace on lines
			.replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
			.trim();

		return text;
	}

	function getEmailStatusBadge(status: string): { class: string; label: string } {
		switch (status) {
			case 'sent':
				return {
					class: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
					label: 'Sent'
				};
			case 'delivered':
				return {
					class: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
					label: 'Delivered'
				};
			case 'failed':
				return {
					class: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
					label: 'Failed'
				};
			case 'bounced':
				return {
					class: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
					label: 'Bounced'
				};
			case 'complaint':
				return {
					class: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
					label: 'Complaint'
				};
			default:
				return {
					class: 'bg-muted text-muted-foreground border-border',
					label: status || 'Pending'
				};
		}
	}

	let expandedEmails = $state<Set<string>>(new Set());

	function toggleEmailExpanded(emailId: string) {
		if (expandedEmails.has(emailId)) {
			expandedEmails.delete(emailId);
		} else {
			expandedEmails.add(emailId);
		}
		expandedEmails = expandedEmails;
	}

	async function copyEmailContent(content: string) {
		try {
			const plainText = stripHtmlToText(content);
			await navigator.clipboard.writeText(plainText);
			toastService.success('Email copied');
		} catch (error) {
			toastService.error('Failed to copy');
		}
	}

	async function copyUserContext() {
		try {
			const markdown = formatUserContextAsMarkdown();
			await navigator.clipboard.writeText(markdown);
			copyButtonState = 'success';
			dispatch('copyContext', { markdown });
			toastService.success('Context copied');
			setTimeout(() => {
				copyButtonState = 'idle';
			}, 2000);
		} catch (error) {
			console.error('Failed to copy:', error);
			toastService.error('Failed to copy');
		}
	}
</script>

<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden tx tx-frame tx-weak">
	<!-- Header with Health Status -->
	<div class="px-3 py-2 border-b border-border bg-muted/30">
		<div class="flex items-center justify-between gap-2">
			<!-- User Identity -->
			<div class="flex items-center gap-2 min-w-0 flex-1">
				<div
					class="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0"
				>
					<User class="w-4 h-4 text-accent" />
				</div>
				<div class="min-w-0">
					<h3 class="text-sm font-semibold text-foreground truncate">
						{userContext.beta?.full_name || userContext.basic.name || 'User'}
					</h3>
					<p class="text-xs text-muted-foreground truncate">{userContext.basic.email}</p>
				</div>
			</div>

			<!-- Health Badge -->
			<div class="flex items-center gap-2 shrink-0">
				<div
					class="px-2 py-1 rounded-md text-xs font-medium border {getHealthBg(
						userHealth.status
					)} {getHealthColor(userHealth.status)}"
				>
					{#if userHealth.status === 'healthy'}
						<Heart class="w-3 h-3 inline -mt-0.5 mr-1" />
					{:else if userHealth.status === 'at-risk'}
						<AlertCircle class="w-3 h-3 inline -mt-0.5 mr-1" />
					{:else if userHealth.status === 'churning'}
						<TrendingDown class="w-3 h-3 inline -mt-0.5 mr-1" />
					{:else}
						<Sparkles class="w-3 h-3 inline -mt-0.5 mr-1" />
					{/if}
					{userHealth.status.charAt(0).toUpperCase() + userHealth.status.slice(1)}
				</div>

				<button
					onclick={copyUserContext}
					class="p-1.5 rounded-md hover:bg-muted transition-colors pressable"
					title="Copy context as Markdown"
				>
					{#if copyButtonState === 'success'}
						<Check class="w-4 h-4 text-emerald-500" />
					{:else}
						<Copy class="w-4 h-4 text-muted-foreground" />
					{/if}
				</button>
			</div>
		</div>
	</div>

	{#if expanded}
		<!-- Quick Stats Row -->
		<div class="px-3 py-2 border-b border-border grid grid-cols-4 gap-2">
			<div class="text-center">
				<div class="text-lg font-bold text-foreground">
					{userContext.activity.project_count}
				</div>
				<div class="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
					Projects
				</div>
			</div>
			<div class="text-center">
				<div class="text-lg font-bold text-foreground">
					{userContext.activity.tasks_created}
				</div>
				<div class="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
					Tasks
				</div>
			</div>
			<div class="text-center">
				<div class="text-lg font-bold text-foreground">
					{userContext.activity.agentic_sessions_count}
				</div>
				<div class="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
					Agentic
				</div>
			</div>
			<div class="text-center">
				<div
					class="text-lg font-bold {userContext.activity.tasks_completed > 0
						? 'text-emerald-600 dark:text-emerald-400'
						: 'text-foreground'}"
				>
					{userContext.activity.tasks_completed}
				</div>
				<div class="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Done</div>
			</div>
		</div>

		<!-- Quick Actions -->
		{#if showActions}
			<div class="px-3 py-2 border-b border-border">
				<div class="text-[0.65rem] uppercase tracking-wide text-muted-foreground mb-1.5">
					Quick Email
				</div>
				<div class="flex flex-wrap gap-1.5">
					<button
						onclick={() => quickEmail('welcome')}
						class="px-2 py-1 text-xs rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 hover:bg-blue-500/20 transition-colors pressable"
					>
						<Sparkles class="w-3 h-3 inline -mt-0.5 mr-0.5" />
						Welcome
					</button>
					<button
						onclick={() => quickEmail('check-in')}
						class="px-2 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors pressable"
					>
						<MessageSquare class="w-3 h-3 inline -mt-0.5 mr-0.5" />
						Check-in
					</button>
					<button
						onclick={() => quickEmail('feedback')}
						class="px-2 py-1 text-xs rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30 hover:bg-violet-500/20 transition-colors pressable"
					>
						<Star class="w-3 h-3 inline -mt-0.5 mr-0.5" />
						Feedback
					</button>
					{#if userHealth.status === 'at-risk' || userHealth.status === 'churning'}
						<button
							onclick={() => quickEmail('re-engage')}
							class="px-2 py-1 text-xs rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition-colors pressable"
						>
							<Zap class="w-3 h-3 inline -mt-0.5 mr-0.5" />
							Re-engage
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Key Signals (if any) -->
		{#if userHealth.signals.length > 0}
			<div class="px-3 py-2 border-b border-border bg-amber-500/5">
				<div class="flex items-center gap-2 flex-wrap">
					<AlertCircle class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
					{#each userHealth.signals as signal}
						<span class="text-xs text-amber-700 dark:text-amber-300">{signal}</span>
					{/each}
				</div>
			</div>
		{/if}

		<div class="divide-y divide-border">
			<!-- Basic Info Section -->
			<div>
				<button
					onclick={() => toggleSection('basic')}
					class="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
				>
					{#if expandedSections.has('basic')}
						<ChevronDown class="w-3.5 h-3.5 text-muted-foreground" />
					{:else}
						<ChevronRight class="w-3.5 h-3.5 text-muted-foreground" />
					{/if}
					<User class="w-3.5 h-3.5 text-muted-foreground" />
					<span class="text-xs font-medium text-foreground">Account</span>
					{#if true}
						{@const badge = getSubscriptionBadge(userContext.basic.subscription_status)}
						<span
							class="ml-auto px-1.5 py-0.5 text-[0.65rem] rounded border {badge.class}"
							>{badge.label}</span
						>
					{/if}
				</button>

				{#if expandedSections.has('basic')}
					<div class="px-3 pb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Member since</span>
							<span class="text-foreground"
								>{formatDate(userContext.basic.created_at)}</span
							>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Last visit</span>
							<span class="text-foreground"
								>{formatRelativeDate(userContext.basic.last_visit)}</span
							>
						</div>
						{#if userContext.beta?.user_timezone}
							<div class="flex justify-between col-span-2">
								<span class="text-muted-foreground">Timezone</span>
								<span class="text-foreground">{userContext.beta.user_timezone}</span
								>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Beta Program Section -->
			{#if userContext.beta}
				<div>
					<button
						onclick={() => toggleSection('beta')}
						class="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
					>
						{#if expandedSections.has('beta')}
							<ChevronDown class="w-3.5 h-3.5 text-muted-foreground" />
						{:else}
							<ChevronRight class="w-3.5 h-3.5 text-muted-foreground" />
						{/if}
						<Star class="w-3.5 h-3.5 text-amber-500" />
						<span class="text-xs font-medium text-foreground">Beta Program</span>
						{#if userContext.beta.beta_tier}
							<span
								class="ml-auto px-1.5 py-0.5 text-[0.65rem] rounded bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30"
							>
								{userContext.beta.beta_tier}
							</span>
						{/if}
					</button>

					{#if expandedSections.has('beta')}
						<div class="px-3 pb-2 space-y-2">
							<!-- Beta Stats -->
							<div class="grid grid-cols-3 gap-2">
								<div class="text-center p-1.5 rounded-md bg-muted/50">
									<div class="text-sm font-semibold text-foreground">
										{userContext.beta.total_feedback_submitted || 0}
									</div>
									<div class="text-[0.6rem] text-muted-foreground">Feedback</div>
								</div>
								<div class="text-center p-1.5 rounded-md bg-muted/50">
									<div class="text-sm font-semibold text-foreground">
										{userContext.beta.total_calls_attended || 0}
									</div>
									<div class="text-[0.6rem] text-muted-foreground">Calls</div>
								</div>
								<div class="text-center p-1.5 rounded-md bg-muted/50">
									<div class="text-sm font-semibold text-foreground">
										{userContext.beta.total_features_requested || 0}
									</div>
									<div class="text-[0.6rem] text-muted-foreground">Requests</div>
								</div>
							</div>

							<!-- Key Info -->
							<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
								{#if userContext.beta.company_name}
									<div class="flex justify-between">
										<span class="text-muted-foreground">Company</span>
										<span class="text-foreground truncate ml-2"
											>{userContext.beta.company_name}</span
										>
									</div>
								{/if}
								{#if userContext.beta.job_title}
									<div class="flex justify-between">
										<span class="text-muted-foreground">Role</span>
										<span class="text-foreground truncate ml-2"
											>{userContext.beta.job_title}</span
										>
									</div>
								{/if}
								{#if userContext.beta.discount_percentage}
									<div class="flex justify-between col-span-2">
										<span class="text-muted-foreground">Discount</span>
										<span
											class="text-emerald-600 dark:text-emerald-400 font-medium"
											>{userContext.beta.discount_percentage}% lifetime</span
										>
									</div>
								{/if}
							</div>

							<!-- Preferences -->
							<div class="flex flex-wrap gap-1">
								{#if userContext.beta.wants_community_access}
									<span
										class="px-1.5 py-0.5 text-[0.6rem] rounded bg-muted text-muted-foreground"
										>Community</span
									>
								{/if}
								{#if userContext.beta.wants_weekly_calls}
									<span
										class="px-1.5 py-0.5 text-[0.6rem] rounded bg-muted text-muted-foreground"
										>Weekly Calls</span
									>
								{/if}
								{#if userContext.beta.wants_feature_updates}
									<span
										class="px-1.5 py-0.5 text-[0.6rem] rounded bg-muted text-muted-foreground"
										>Updates</span
									>
								{/if}
							</div>

							<!-- Challenge -->
							{#if userContext.beta.biggest_challenge}
								<div
									class="p-2 rounded-md bg-amber-500/5 border border-amber-500/20 tx tx-static tx-weak"
								>
									<div
										class="text-[0.65rem] uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5"
									>
										Challenge
									</div>
									<p class="text-xs text-foreground line-clamp-2">
										{userContext.beta.biggest_challenge}
									</p>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Activity Section -->
			<div>
				<button
					onclick={() => toggleSection('activity')}
					class="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
				>
					{#if expandedSections.has('activity')}
						<ChevronDown class="w-3.5 h-3.5 text-muted-foreground" />
					{:else}
						<ChevronRight class="w-3.5 h-3.5 text-muted-foreground" />
					{/if}
					<Activity class="w-3.5 h-3.5 text-blue-500" />
					<span class="text-xs font-medium text-foreground">Activity</span>
					<span class="ml-auto text-[0.65rem] text-muted-foreground">30 days</span>
				</button>

				{#if expandedSections.has('activity')}
					<div class="px-3 pb-2 space-y-2">
						<!-- Completion Rate -->
						{#if userContext.activity.tasks_created > 0}
							<div class="flex items-center gap-2">
								<div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
									<div
										class="h-full bg-emerald-500 rounded-full transition-all"
										style="width: {Math.round(
											(userContext.activity.tasks_completed /
												userContext.activity.tasks_created) *
												100
										)}%"
									></div>
								</div>
								<span class="text-xs text-muted-foreground">
									{Math.round(
										(userContext.activity.tasks_completed /
											userContext.activity.tasks_created) *
											100
									)}% done
								</span>
							</div>
						{/if}

						<!-- Recent Projects -->
						{#if userContext.activity.recent_projects.length > 0}
							<div>
								<div
									class="text-[0.65rem] uppercase tracking-wide text-muted-foreground mb-1"
								>
									Recent Projects
								</div>
								<div class="space-y-1">
									{#each userContext.activity.recent_projects.slice(0, 3) as project}
										<div
											class="flex items-center justify-between text-xs p-1.5 rounded-md bg-muted/50"
										>
											<span class="text-foreground truncate flex-1"
												>{project.title}</span
											>
											<span class="text-muted-foreground ml-2 shrink-0"
												>{formatRelativeDate(project.updated_at)}</span
											>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Extra Metrics -->
						<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
							<div class="flex justify-between">
								<span class="text-muted-foreground">Daily briefs</span>
								<span class="text-foreground"
									>{userContext.activity.daily_briefs_count}</span
								>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">Calendar</span>
								<span class="text-foreground"
									>{userContext.activity.calendar_connected
										? 'Connected'
										: 'No'}</span
								>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Onboarding Section -->
			{#if userContext.onboarding}
				<div>
					<button
						onclick={() => toggleSection('onboarding')}
						class="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
					>
						{#if expandedSections.has('onboarding')}
							<ChevronDown class="w-3.5 h-3.5 text-muted-foreground" />
						{:else}
							<ChevronRight class="w-3.5 h-3.5 text-muted-foreground" />
						{/if}
						<BookOpen class="w-3.5 h-3.5 text-emerald-500" />
						<span class="text-xs font-medium text-foreground">Onboarding</span>
						{#if userContext.onboarding.completedAt}
							<span
								class="ml-auto text-[0.65rem] text-emerald-600 dark:text-emerald-400"
							>
								<CheckCircle class="w-3 h-3 inline -mt-0.5" /> Done
							</span>
						{/if}
					</button>

					{#if expandedSections.has('onboarding')}
						<div class="px-3 pb-2 space-y-2">
							{#if userContext.onboarding.projects}
								<div class="p-2 rounded-md bg-blue-500/5 border border-blue-500/20">
									<div
										class="text-[0.65rem] uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-0.5"
									>
										Projects
									</div>
									<p class="text-xs text-foreground line-clamp-2">
										{userContext.onboarding.projects}
									</p>
								</div>
							{/if}
							{#if userContext.onboarding.challenges}
								<div
									class="p-2 rounded-md bg-amber-500/5 border border-amber-500/20"
								>
									<div
										class="text-[0.65rem] uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5"
									>
										Challenges
									</div>
									<p class="text-xs text-foreground line-clamp-2">
										{userContext.onboarding.challenges}
									</p>
								</div>
							{/if}
							{#if userContext.onboarding.helpFocus}
								<div
									class="p-2 rounded-md bg-violet-500/5 border border-violet-500/20"
								>
									<div
										class="text-[0.65rem] uppercase tracking-wide text-violet-600 dark:text-violet-400 mb-0.5"
									>
										Focus
									</div>
									<p class="text-xs text-foreground line-clamp-2">
										{userContext.onboarding.helpFocus}
									</p>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Email History Section -->
			{#if userContext.emailHistory && userContext.emailHistory.length > 0}
				<div>
					<button
						onclick={() => toggleSection('emails')}
						class="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
					>
						{#if expandedSections.has('emails')}
							<ChevronDown class="w-3.5 h-3.5 text-muted-foreground" />
						{:else}
							<ChevronRight class="w-3.5 h-3.5 text-muted-foreground" />
						{/if}
						<Mail class="w-3.5 h-3.5 text-indigo-500" />
						<span class="text-xs font-medium text-foreground">Email History</span>
						<span
							class="ml-auto px-1.5 py-0.5 text-[0.65rem] rounded bg-muted text-muted-foreground"
						>
							{userContext.emailHistory.length}
						</span>
					</button>

					{#if expandedSections.has('emails')}
						<div class="px-3 pb-2 space-y-1.5">
							{#each userContext.emailHistory.slice(0, 5) as email (email.id)}
								<div class="rounded-md border border-border overflow-hidden">
									<!-- Email Header (clickable to expand) -->
									<button
										onclick={() => toggleEmailExpanded(email.id)}
										class="w-full p-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left flex items-start gap-2"
									>
										<div class="pt-0.5 shrink-0">
											{#if expandedEmails.has(email.id)}
												<ChevronDown
													class="w-3 h-3 text-muted-foreground"
												/>
											{:else}
												<ChevronRight
													class="w-3 h-3 text-muted-foreground"
												/>
											{/if}
										</div>
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2 mb-0.5">
												<p
													class="text-xs font-medium text-foreground truncate flex-1"
												>
													{email.subject}
												</p>
												{#if true}
													{@const badge = getEmailStatusBadge(
														email.recipient_status
													)}
													<span
														class="px-1.5 py-0.5 text-[0.6rem] rounded border shrink-0 {badge.class}"
													>
														{badge.label}
													</span>
												{/if}
											</div>
											<div
												class="flex items-center gap-2 text-[0.65rem] text-muted-foreground"
											>
												<span
													>{formatRelativeDate(
														email.sent_at || email.created_at
													)}</span
												>
												{#if email.opened_at}
													<span
														class="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5"
													>
														<Eye class="w-3 h-3" />
														{email.open_count || 1}x
													</span>
												{/if}
												{#if email.error_message}
													<span
														class="text-red-500 flex items-center gap-0.5"
													>
														<AlertCircle class="w-3 h-3" />
														Error
													</span>
												{/if}
											</div>
										</div>
									</button>

									<!-- Expanded Email Content -->
									{#if expandedEmails.has(email.id)}
										<div class="border-t border-border bg-card">
											<!-- Email Metadata -->
											<div
												class="px-3 py-2 border-b border-border text-xs grid grid-cols-2 gap-x-4 gap-y-1"
											>
												<div class="flex justify-between">
													<span class="text-muted-foreground">From</span>
													<span class="text-foreground"
														>{email.from_name}</span
													>
												</div>
												<div class="flex justify-between">
													<span class="text-muted-foreground">To</span>
													<span
														class="text-foreground font-mono text-[0.65rem]"
														>{email.recipient_email}</span
													>
												</div>
												<div class="flex justify-between">
													<span class="text-muted-foreground">Sent</span>
													<span class="text-foreground"
														>{formatDate(
															email.sent_at || email.created_at
														)}</span
													>
												</div>
												{#if email.delivered_at}
													<div class="flex justify-between">
														<span class="text-muted-foreground"
															>Delivered</span
														>
														<span class="text-foreground"
															>{formatDate(email.delivered_at)}</span
														>
													</div>
												{/if}
												{#if email.opened_at}
													<div class="flex justify-between col-span-2">
														<span class="text-muted-foreground"
															>First opened</span
														>
														<span
															class="text-emerald-600 dark:text-emerald-400"
															>{formatDate(email.opened_at)}</span
														>
													</div>
												{/if}
												{#if email.category}
													<div class="flex justify-between col-span-2">
														<span class="text-muted-foreground"
															>Category</span
														>
														<span class="text-foreground"
															>{email.category}</span
														>
													</div>
												{/if}
											</div>

											<!-- Email Body -->
											<div class="p-3">
												<div class="flex items-center justify-between mb-2">
													<span
														class="text-[0.65rem] uppercase tracking-wide text-muted-foreground"
														>Content</span
													>
													<button
														onclick={() =>
															copyEmailContent(email.content)}
														class="px-1.5 py-0.5 text-[0.65rem] rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors pressable flex items-center gap-1"
													>
														<Copy class="w-3 h-3" />
														Copy
													</button>
												</div>
												<div
													class="p-3 rounded-md bg-muted/50 border border-border text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto"
												>
													{stripHtmlToText(email.content)}
												</div>
											</div>

											<!-- Error Message -->
											{#if email.error_message}
												<div class="px-3 pb-3">
													<div
														class="p-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2"
													>
														<AlertCircle
															class="w-3.5 h-3.5 shrink-0 mt-0.5"
														/>
														<span>{email.error_message}</span>
													</div>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
							{#if userContext.emailHistory.length > 5}
								<p class="text-[0.65rem] text-center text-muted-foreground pt-1">
									+{userContext.emailHistory.length - 5} more emails
								</p>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
