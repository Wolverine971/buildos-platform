<!-- apps/web/src/lib/components/admin/notifications/LogFilters.svelte -->
<script lang="ts">
	import { Search, X, Calendar, Filter } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import type { NotificationChannel } from '@buildos/shared-types';

	type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

	interface FilterConfig {
		showEventType?: boolean;
		showChannel?: boolean;
		showStatus?: boolean;
		showLevel?: boolean;
		showNamespace?: boolean;
		showUserId?: boolean;
		showDateRange?: boolean;
		showSearch?: boolean;
	}

	interface FilterValues {
		event_type?: string;
		channel?: NotificationChannel | '';
		status?: string;
		level?: LogLevel | '';
		namespace?: string;
		user_id?: string;
		from?: string;
		to?: string;
		search?: string;
	}

	interface Props {
		filters: FilterValues;
		config?: FilterConfig;
		onFilterChange?: (filters: FilterValues) => void;
		onClear?: () => void;
	}

	let {
		filters = $bindable({} as FilterValues),
		config = {
			showEventType: false,
			showChannel: false,
			showStatus: false,
			showLevel: false,
			showNamespace: false,
			showUserId: false,
			showDateRange: true,
			showSearch: true
		},
		onFilterChange,
		onClear
	}: Props = $props();

	// Track if any filters are active
	const hasActiveFilters = $derived(
		Object.values(filters).some((value) => value !== undefined && value !== '')
	);

	function updateFilter(key: keyof FilterValues, value: string) {
		filters = {
			...filters,
			[key]: value || undefined
		};
		onFilterChange?.(filters);
	}

	function clearFilters() {
		filters = {};
		onClear?.();
	}

	// Event type options
	const eventTypes = [
		'daily_brief_ready',
		'task_reminder',
		'task_assigned',
		'task_completed',
		'project_created',
		'project_updated',
		'system_notification'
	];

	// Status options
	const statusOptions = [
		'pending',
		'sent',
		'delivered',
		'failed',
		'bounced',
		'opened',
		'clicked'
	];

	// Log level options
	const logLevels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];

	// Channel options
	const channels: NotificationChannel[] = ['push', 'email', 'sms', 'in_app'];
</script>

<div class="bg-card rounded-lg border border-border p-4">
	<div class="flex items-center justify-between mb-4">
		<div class="flex items-center space-x-2 text-foreground">
			<Filter class="w-4 h-4" />
			<h3 class="text-sm font-medium">Filters</h3>
		</div>
		{#if hasActiveFilters}
			<Button size="sm" variant="ghost" onclick={clearFilters} icon={X}>Clear All</Button>
		{/if}
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
		<!-- Search -->
		{#if config.showSearch}
			<div class="lg:col-span-2">
				<label
					for="log-filter-search"
					class="block text-sm font-medium text-foreground mb-1"
				>
					Search
				</label>
				<div class="relative">
					<Search
						class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
					/>
					<input
						id="log-filter-search"
						type="text"
						value={filters.search || ''}
						oninput={(e) => updateFilter('search', e.currentTarget.value)}
						placeholder="Search messages, namespaces..."
						class="w-full pl-10 pr-3 py-2 border border-border rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
					/>
				</div>
			</div>
		{/if}

		<!-- Event Type -->
		{#if config.showEventType}
			<div>
				<label
					for="log-filter-event-type"
					class="block text-sm font-medium text-foreground mb-1"
				>
					Event Type
				</label>
				<Select
					id="log-filter-event-type"
					value={filters.event_type || ''}
					onchange={(e) => updateFilter('event_type', e.detail)}
					size="md"
					placeholder="All events"
				>
					<option value="">All Events</option>
					{#each eventTypes as type}
						<option value={type}
							>{type
								.replace(/_/g, ' ')
								.replace(/\b\w/g, (l) => l.toUpperCase())}</option
						>
					{/each}
				</Select>
			</div>
		{/if}

		<!-- Channel -->
		{#if config.showChannel}
			<div>
				<label
					for="log-filter-channel"
					class="block text-sm font-medium text-foreground mb-1"
				>
					Channel
				</label>
				<Select
					id="log-filter-channel"
					value={filters.channel || ''}
					onchange={(e) => updateFilter('channel', e.detail)}
					size="md"
					placeholder="All channels"
				>
					<option value="">All Channels</option>
					{#each channels as channel}
						<option value={channel}>{channel.toUpperCase()}</option>
					{/each}
				</Select>
			</div>
		{/if}

		<!-- Status -->
		{#if config.showStatus}
			<div>
				<label
					for="log-filter-status"
					class="block text-sm font-medium text-foreground mb-1"
				>
					Status
				</label>
				<Select
					id="log-filter-status"
					value={filters.status || ''}
					onchange={(e) => updateFilter('status', e.detail)}
					size="md"
					placeholder="All statuses"
				>
					<option value="">All Statuses</option>
					{#each statusOptions as status}
						<option value={status}
							>{status
								.replace(/_/g, ' ')
								.replace(/\b\w/g, (l) => l.toUpperCase())}</option
						>
					{/each}
				</Select>
			</div>
		{/if}

		<!-- Log Level -->
		{#if config.showLevel}
			<div>
				<label
					for="log-filter-level"
					class="block text-sm font-medium text-foreground mb-1"
				>
					Log Level
				</label>
				<Select
					id="log-filter-level"
					value={filters.level || ''}
					onchange={(e) => updateFilter('level', e.detail)}
					size="md"
					placeholder="All levels"
				>
					<option value="">All Levels</option>
					{#each logLevels as level}
						<option value={level}>{level.toUpperCase()}</option>
					{/each}
				</Select>
			</div>
		{/if}

		<!-- Namespace -->
		{#if config.showNamespace}
			<div>
				<label
					for="log-filter-namespace"
					class="block text-sm font-medium text-foreground mb-1"
				>
					Namespace
				</label>
				<input
					id="log-filter-namespace"
					type="text"
					value={filters.namespace || ''}
					oninput={(e) => updateFilter('namespace', e.currentTarget.value)}
					placeholder="e.g. web:api:emit"
					class="w-full px-3 py-2 border border-border rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
				/>
			</div>
		{/if}

		<!-- Date Range -->
		{#if config.showDateRange}
			<div>
				<label
					for="log-filter-from"
					class="block text-sm font-medium text-foreground mb-1"
				>
					From Date
				</label>
				<div class="relative">
					<Calendar
						class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
					/>
					<input
						id="log-filter-from"
						type="datetime-local"
						value={filters.from || ''}
						oninput={(e) => updateFilter('from', e.currentTarget.value)}
						class="w-full pl-10 pr-3 py-2 border border-border rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
					/>
				</div>
			</div>

			<div>
				<label
					for="log-filter-to"
					class="block text-sm font-medium text-foreground mb-1"
				>
					To Date
				</label>
				<div class="relative">
					<Calendar
						class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
					/>
					<input
						id="log-filter-to"
						type="datetime-local"
						value={filters.to || ''}
						oninput={(e) => updateFilter('to', e.currentTarget.value)}
						class="w-full pl-10 pr-3 py-2 border border-border rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
					/>
				</div>
			</div>
		{/if}
	</div>
</div>
