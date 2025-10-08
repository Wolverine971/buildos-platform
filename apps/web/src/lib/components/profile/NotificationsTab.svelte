<!-- apps/web/src/lib/components/profile/NotificationsTab.svelte -->
<script lang="ts">
	import { Bell } from 'lucide-svelte';
	import NotificationPreferences from '$lib/components/settings/NotificationPreferences.svelte';

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();
</script>

<div class="space-y-4 sm:space-y-6">
	<!-- Header -->
	<div class="flex items-start gap-3 sm:gap-4">
		<div
			class="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 shadow-lg flex-shrink-0"
		>
			<Bell class="w-5 h-5 sm:w-6 sm:h-6 text-white" />
		</div>
		<div class="flex-1 min-w-0">
			<h2 class="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
				Notification Settings
			</h2>
			<p class="text-xs sm:text-base text-gray-600 dark:text-gray-400 mt-1">
				Manage how you receive notifications
			</p>
		</div>
	</div>

	<!-- Notification Preferences Component -->
	<NotificationPreferences {userId} />
</div>
