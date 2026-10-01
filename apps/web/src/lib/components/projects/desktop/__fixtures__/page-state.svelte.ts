// apps/web/src/lib/components/projects/desktop/__fixtures__/page-state.svelte.ts
// A reactive stand-in for `$app/state` so shallow-routing tests see pushState land.
export const page = $state<{ state: App.PageState }>({ state: {} });
