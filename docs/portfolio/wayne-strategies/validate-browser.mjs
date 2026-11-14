// docs/portfolio/wayne-strategies/validate-browser.mjs
// Read-only browser checks for the isolated static preview, using the repo's existing browser tooling.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(base, '../../..');
const localRequire = createRequire(path.join(repo, 'apps/web/package.json'));
const { chromium } = localRequire('@playwright/test');
const browser = await chromium.launch({ channel: 'chrome' });
try {
	const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(pathToFileURL(path.join(base, 'preview/index.html')).href);
	await page
		.locator('img')
		.evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
	const layout = await page.evaluate(() => {
		const clipped = [];
		for (const sample of document.querySelectorAll('.sample')) {
			const stage = sample.querySelector('.stage');
			const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
			while (walker.nextNode()) {
				const node = walker.currentNode;
				if (!node.textContent.trim()) continue;
				const range = document.createRange();
				range.selectNodeContents(node);
				for (const rect of range.getClientRects()) {
					if (!rect.width || !rect.height) continue;
					for (let parent = node.parentElement; parent; parent = parent.parentElement) {
						const style = getComputedStyle(parent);
						if (style.overflow === 'hidden' || parent === stage) {
							const bound = parent.getBoundingClientRect();
							if (
								rect.left < bound.left - 1 ||
								rect.top < bound.top - 1 ||
								rect.right > bound.right + 1 ||
								rect.bottom > bound.bottom + 1
							) {
								clipped.push({
									layer: sample.dataset.layer,
									width: sample.dataset.width,
									text: node.textContent.trim(),
									boundary: parent.className
								});
								break;
							}
						}
						if (parent === stage) break;
					}
				}
			}
		}
		return {
			samples: document.querySelectorAll('.sample').length,
			loadedImages: [...document.images].filter(
				(image) => image.complete && image.naturalWidth > 0
			).length,
			images: document.images.length,
			controls: document.querySelectorAll(
				'.stage button,.stage input,.stage a,.stage select,.stage textarea'
			).length,
			clippedText: clipped
		};
	});
	// Exercise the optional animation CSS and the user's reduced-motion setting.
	await page
		.locator('.canvas')
		.first()
		.evaluate((element) => element.classList.add('animated'));
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const reducedMotionAnimation = await page
		.locator('.canvas > div')
		.first()
		.evaluate((element) => getComputedStyle(element).animationName);
	await page
		.locator('.canvas')
		.first()
		.evaluate((element) => element.classList.remove('animated'));
	const out = path.join(repo, 'output/playwright/buildos-portfolio');
	await mkdir(out, { recursive: true });
	await page.screenshot({ path: path.join(out, 'contact-sheet.png'), fullPage: true });
	const result = { ...layout, errors, reducedMotionAnimation };
	await writeFile(
		path.join(base, 'preview/browser-validation.json'),
		JSON.stringify(result, null, 2) + '\n'
	);
	console.log(JSON.stringify(result, null, 2));
	assert.equal(result.samples, 18);
	assert.equal(result.loadedImages, result.images);
	assert.equal(result.controls, 0);
	assert.deepEqual(result.clippedText, []);
	assert.deepEqual(errors, []);
	assert.equal(reducedMotionAnimation, 'none');
} finally {
	await browser.close();
}
