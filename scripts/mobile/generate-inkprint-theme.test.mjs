// scripts/mobile/generate-inkprint-theme.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hslToHex, parseTokens, buildPalettes } from './generate-inkprint-theme.mjs';

test('hslToHex converts known values', () => {
	assert.equal(hslToHex(0, 0, 100), '#ffffff');
	assert.equal(hslToHex(240, 10, 10), '#17171c');
	assert.equal(hslToHex(24, 80, 40), '#b85614');
});

const css = `
:root { --background: 40 15% 98%; /* paper */ --shadow-ink: 0 1px 2px rgba(0,0,0,.1); --tx-ink-rgb: 10, 10, 10; --data-foreground: 0 0% 100%; }
.dark { --background: 32 4% 11%; }
:root { --wt-a: 150 55% 33%; }
.dark { --wt-a: 150 50% 50%; }
`;

test('parseTokens reads multiple blocks and skips non-HSL tokens', () => {
	const { light, dark } = parseTokens(css);
	assert.deepEqual(Object.keys(light), ['background', 'dataForeground', 'wtA']);
	assert.deepEqual(Object.keys(dark), ['background', 'wtA']);
});

test('dark inherits light tokens it does not override', () => {
	const { light, dark } = buildPalettes(css);
	assert.equal(dark.dataForeground, light.dataForeground);
	assert.notEqual(dark.background, light.background);
	assert.deepEqual(Object.keys(dark), Object.keys(light));
});
