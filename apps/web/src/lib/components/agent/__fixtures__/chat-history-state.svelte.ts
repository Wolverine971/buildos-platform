export { page } from '../../projects/desktop/__fixtures__/page-state.svelte';
export const navigating = $state<{ to: { url: URL } | null }>({ to: null });
