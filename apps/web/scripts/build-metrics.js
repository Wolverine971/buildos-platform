// apps/web/scripts/build-metrics.js
import { statSync, readdirSync } from 'fs';
import { join } from 'path';

function getDirectorySize(dir) {
	let size = 0;
	try {
		const files = readdirSync(dir, { withFileTypes: true });
		for (const file of files) {
			const path = join(dir, file.name);
			if (file.isDirectory()) {
				size += getDirectorySize(path);
			} else {
				size += statSync(path).size;
			}
		}
	} catch (_e) {
		// Directory doesn't exist
	}
	return size;
}

function formatBytes(bytes) {
	const sizes = ['B', 'KB', 'MB', 'GB'];
	if (bytes === 0) return '0 B';
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function getFileCount(dir) {
	let count = 0;
	try {
		const files = readdirSync(dir, { withFileTypes: true });
		for (const file of files) {
			const path = join(dir, file.name);
			if (file.isDirectory()) {
				count += getFileCount(path);
			} else {
				count++;
			}
		}
	} catch (_e) {
		// Directory doesn't exist
	}
	return count;
}

console.log('\n📊 Build Metrics Report\n');
console.log('=' + '='.repeat(60));

// Measure build directory sizes
const directories = [
	{ name: 'build/', path: 'build' },
	{ name: '.svelte-kit/', path: '.svelte-kit' },
	{ name: 'node_modules/', path: 'node_modules' }
];

console.log('\n📁 Directory Sizes:\n');
console.log('Directory'.padEnd(20) + 'Size'.padEnd(15) + 'Files');
console.log('-'.repeat(50));

for (const dir of directories) {
	const size = getDirectorySize(dir.path);
	const fileCount = getFileCount(dir.path);
	console.log(
		dir.name.padEnd(20) +
			formatBytes(size).padEnd(15) +
			(fileCount > 0 ? fileCount.toString() : 'N/A')
	);
}

// Analyze chunks
console.log('\n\n📦 Chunk Analysis:\n');
try {
	const chunksDir = join('build', 'chunks');
	const chunks = readdirSync(chunksDir);
	const chunkSizes = chunks
		.map((chunk) => ({
			name: chunk,
			size: statSync(join(chunksDir, chunk)).size
		}))
		.sort((a, b) => b.size - a.size)
		.slice(0, 10);

	console.log('Top 10 Chunks by Size:');
	console.log('-'.repeat(50));
	console.log('Chunk'.padEnd(35) + 'Size');
	console.log('-'.repeat(50));

	for (const chunk of chunkSizes) {
		console.log(chunk.name.padEnd(35) + formatBytes(chunk.size));
	}

	// Total chunks size
	const totalChunksSize = chunks.reduce((acc, chunk) => {
		return acc + statSync(join(chunksDir, chunk)).size;
	}, 0);

	console.log('-'.repeat(50));
	console.log('Total chunks:'.padEnd(35) + chunks.length);
	console.log('Total size:'.padEnd(35) + formatBytes(totalChunksSize));
} catch (_e) {
	console.log('No chunks directory found. Run build first.');
}

// Analyze assets
console.log('\n\n🎨 Asset Analysis:\n');
try {
	const assetsDir = join('build', 'assets');
	const assets = readdirSync(assetsDir);

	const assetTypes = {};
	for (const asset of assets) {
		const ext = asset.split('.').pop();
		if (!assetTypes[ext]) {
			assetTypes[ext] = { count: 0, size: 0 };
		}
		assetTypes[ext].count++;
		assetTypes[ext].size += statSync(join(assetsDir, asset)).size;
	}

	console.log('Asset Type'.padEnd(15) + 'Count'.padEnd(10) + 'Total Size');
	console.log('-'.repeat(40));

	for (const [ext, data] of Object.entries(assetTypes)) {
		console.log(ext.padEnd(15) + data.count.toString().padEnd(10) + formatBytes(data.size));
	}
} catch (_e) {
	console.log('No assets directory found. Run build first.');
}

// Build time (if available)
console.log('\n\n⏱️  Build Performance:\n');
console.log('Run with `time pnpm run build` to measure build time');
console.log('Run with `pnpm run build:analyze` to generate bundle visualization');

console.log('\n' + '='.repeat(60) + '\n');
