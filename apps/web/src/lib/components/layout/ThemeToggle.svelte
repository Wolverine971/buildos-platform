<!-- apps/web/src/lib/components/layout/ThemeToggle.svelte -->
<script lang="ts">
	import { toggleMode } from 'mode-watcher';
	import { Sun, Moon } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let isDark = false;

	onMount(() => {
		// Check if we're in dark mode
		isDark = document.documentElement.classList.contains('dark');
		updateIOSStatusBar(isDark);

		// Listen for theme changes
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
					isDark = document.documentElement.classList.contains('dark');
					updateIOSStatusBar(isDark);
				}
			});
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});

		return () => observer.disconnect();
	});

	function updateIOSStatusBar(isDarkMode: boolean) {
		// Update the meta theme-color tag for iOS status bar
		const metaThemeColor = document.querySelector('meta[name="theme-color"]:not([media])');
		if (metaThemeColor) {
			metaThemeColor.setAttribute('content', isDarkMode ? '#0f172a' : '#f9fafb');
		}

		// Update iOS status bar style meta tag
		const statusBarMeta = document.querySelector(
			'meta[name="apple-mobile-web-app-status-bar-style"]'
		);
		if (statusBarMeta) {
			// Use black for dark mode to avoid overlap, default for light mode
			statusBarMeta.setAttribute('content', isDarkMode ? 'black' : 'default');
		}
	}
</script>

<Button
	onclick={toggleMode}
	variant="ghost"
	size="sm"
	icon={isDark ? Sun : Moon}
	class="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white min-h-0"
	aria-label="Toggle theme"
></Button>
