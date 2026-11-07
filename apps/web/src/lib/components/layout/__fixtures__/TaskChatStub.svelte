<script lang="ts">
	import type { ProjectFocus } from '@buildos/shared-types';

	let {
		initialProjectFocus,
		hidden,
		onClose,
		onParked
	}: {
		initialProjectFocus?: ProjectFocus;
		hidden: boolean;
		onClose: () => void;
		onParked: (sessionId: string, focus: ProjectFocus | null) => void;
	} = $props();

	export function hardParkAndClose() {
		onClose();
	}
</script>

<div role="dialog" aria-label="Chat" {hidden}>
	<output>{JSON.stringify(initialProjectFocus ?? null)}</output>
	<input aria-label="Draft" />
	<button onclick={() => onParked('session-1', initialProjectFocus ?? null)}>Minimize</button>
</div>
