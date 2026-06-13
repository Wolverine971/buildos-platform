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
			bg: 'bg-info/10',
			border: 'border border-info/30',
			text: 'text-foreground',
			icon_color: 'text-info',
			texture: 'tx tx-thread tx-weak'
		},
		success: {
			icon: CircleCheck,
			bg: 'bg-success/10',
			border: 'border border-success/30',
			text: 'text-foreground',
			icon_color: 'text-success',
			texture: 'tx tx-grain tx-weak'
		},
		warning: {
			icon: TriangleAlert,
			bg: 'bg-warning/10',
			border: 'border border-warning/30',
			text: 'text-foreground',
			icon_color: 'text-warning',
			texture: 'tx tx-static tx-weak'
		},
		error: {
			icon: CircleAlert,
			bg: 'bg-destructive/10',
			border: 'border border-destructive/30',
			text: 'text-foreground',
			icon_color: 'text-destructive',
			texture: 'tx tx-static tx-weak'
		}
	};

	const config = $derived(variantConfig[variant]);

	function handleClose() {
		isVisible = false;
		onClose?.();
	}

	const containerClasses = $derived(
		`rounded-lg p-3 sm:p-4 shadow-ink ${config.bg} ${config.border} ${config.text} ${config.texture} ${className}`
	);

	// Errors and warnings should interrupt screen readers; info/success should not.
	const ariaRole = $derived(variant === 'error' || variant === 'warning' ? 'alert' : 'status');
	const ariaLive = $derived(
		variant === 'error' || variant === 'warning' ? 'assertive' : 'polite'
	);
</script>

{#if isVisible}
	<div class={containerClasses} role={ariaRole} aria-live={ariaLive} {...rest}>
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
					type="button"
					class="flex-shrink-0 flex items-start pt-0.5 hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded-md pressable"
					onclick={handleClose}
					aria-label="Close alert"
				>
					<X class="w-5 h-5" />
				</button>
			{/if}
		</div>
	</div>
{/if}
