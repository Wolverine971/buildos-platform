<!-- apps/web/src/lib/components/ui/Alert.svelte -->
<script lang="ts">
	import { CircleAlert, CircleCheck, TriangleAlert, Info, X } from 'lucide-svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	type AlertVariant = 'info' | 'success' | 'warning' | 'error';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		variant?: AlertVariant;
		title?: string;
		description?: string;
		closeable?: boolean;
		onClose?: () => void;
		icon?: Snippet;
		children?: Snippet;
	}

	let {
		variant = 'info',
		title,
		description,
		closeable = false,
		onClose,
		icon,
		children,
		class: className = '',
		...rest
	}: Props = $props();

	let isVisible = $state(true);

	// Inkprint design - Status colors paired with semantic textures
	// Per design bible: Success→Grain (steady progress), Warning/Danger→Static (interference), Info→Thread (connection)
	const variantConfig: Record<
		AlertVariant,
		{ icon: any; bg: string; border: string; text: string; icon_color: string; texture: string }
	> = {
		info: {
			icon: Info,
			bg: 'bg-muted/50',
			border: 'border border-border',
			text: 'text-foreground',
			icon_color: 'text-muted-foreground',
			texture: 'tx tx-thread tx-weak'
		},
		success: {
			icon: CircleCheck,
			bg: 'bg-emerald-50 dark:bg-emerald-900/10',
			border: 'border border-emerald-200 dark:border-emerald-800',
			text: 'text-foreground',
			icon_color: 'text-emerald-600 dark:text-emerald-400',
			texture: 'tx tx-grain tx-weak'
		},
		warning: {
			icon: TriangleAlert,
			bg: 'bg-amber-50 dark:bg-amber-900/10',
			border: 'border border-amber-200 dark:border-amber-800',
			text: 'text-foreground',
			icon_color: 'text-amber-600 dark:text-amber-400',
			texture: 'tx tx-static tx-weak'
		},
		error: {
			icon: CircleAlert,
			bg: 'bg-red-50 dark:bg-red-900/10',
			border: 'border border-red-200 dark:border-red-800',
			text: 'text-foreground',
			icon_color: 'text-red-600 dark:text-red-400',
			texture: 'tx tx-static tx-weak'
		}
	};

	const config = variantConfig[variant];

	function handleClose() {
		isVisible = false;
		onClose?.();
	}

	const containerClasses = `rounded-lg p-3 sm:p-4 shadow-ink ${config.bg} ${config.border} ${config.text} ${config.texture} ${className}`;
</script>

{#if isVisible}
	<div class={containerClasses} role="alert" {...rest}>
		<div class="flex gap-2 sm:gap-3">
			<!-- Icon -->
			{#if icon}
				<div class="flex-shrink-0 flex items-start pt-0.5">
					{@render icon()}
				</div>
			{:else}
				{@const AlertIcon = config.icon}
				<div class="flex-shrink-0 flex items-start pt-0.5">
					<AlertIcon class="w-4 h-4 sm:w-5 sm:h-5 {config.icon_color}" />
				</div>
			{/if}

			<!-- Content -->
			<div class="flex-1 min-w-0">
				{#if title}
					<h3 class="font-semibold text-sm mb-1">
						{title}
					</h3>
				{/if}

				{#if children}
					<div class="text-sm {title ? 'text-muted-foreground' : ''}">
						{@render children()}
					</div>
				{:else if description}
					<p class="text-sm {title ? 'text-muted-foreground' : ''}">
						{description}
					</p>
				{/if}
			</div>

			<!-- Close button -->
			{#if closeable}
				<button
					class="flex-shrink-0 flex items-start pt-0.5 hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded pressable"
					onclick={handleClose}
					aria-label="Close alert"
				>
					<X class="w-5 h-5" />
				</button>
			{/if}
		</div>
	</div>
{/if}
