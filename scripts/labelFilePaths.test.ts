// scripts/labelFilePaths.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { addOrUpdatePathCommentInLines } from './labelFilePaths.ts';

const BODY = "import { x } from 'y';\n";

test('keeps a single label on paths with commas (Expo route groups)', () => {
	const label = '// apps/mobile/src/app/(tabs)/(today,workspace)/project/[id].tsx';
	const once = addOrUpdatePathCommentInLines(BODY, label);
	const twice = addOrUpdatePathCommentInLines(once, label);
	assert.equal(once, `${label}\n${BODY}`);
	assert.equal(twice, once);
});

test('keeps a single label on paths with = (SvelteKit param matchers)', () => {
	const label = '<!-- apps/web/src/routes/(public)/[handle=at_handle]/+page.svelte -->';
	const body = '<script lang="ts"></script>\n';
	const once = addOrUpdatePathCommentInLines(body, label);
	assert.equal(addOrUpdatePathCommentInLines(once, label), once);
});

test('collapses repeated labels left by earlier runs', () => {
	const label = '// apps/mobile/src/app/(tabs)/(today,workspace)/project/[id].tsx';
	const messy = `${label}\n${label}\n${label}\n${BODY}`;
	assert.equal(addOrUpdatePathCommentInLines(messy, label), `${label}\n${BODY}`);
});

test('replaces a stale label after a file moves, including its repeats', () => {
	const stale = '// apps/mobile/src/app/(tabs)/(today,inbox)/project/[id].tsx';
	const label = '// apps/mobile/src/app/(tabs)/(today,workspace)/project/[id].tsx';
	const messy = `${stale}\n${stale}\n${BODY}`;
	assert.equal(addOrUpdatePathCommentInLines(messy, label), `${label}\n${BODY}`);
});

test('keeps a real comment below the label even if it looks like a path', () => {
	const label = '// scripts/foo.ts';
	const content = `${label}\n// see helpers.ts\n${BODY}`;
	assert.equal(addOrUpdatePathCommentInLines(content, label), content);
});

test('puts the label after a shebang and repairs a label written above one', () => {
	const label = '// scripts/run.mjs';
	const shebang = '#!/usr/bin/env node';
	const expected = `${shebang}\n${label}\n${BODY}`;
	assert.equal(addOrUpdatePathCommentInLines(`${shebang}\n${BODY}`, label), expected);
	assert.equal(addOrUpdatePathCommentInLines(`${label}\n${shebang}\n${BODY}`, label), expected);
	assert.equal(addOrUpdatePathCommentInLines(expected, label), expected);
});
