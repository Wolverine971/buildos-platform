// apps/web/scripts/archive/test-prettier.js

// #!/usr/bin/env node

import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing Prettier installation...\n');

// Test 1: Check version
exec('npx prettier --version', (error, stdout, _stderr) => {
	if (error) {
		console.error('❌ Error checking Prettier version:', error);
		return;
	}
	console.log('✅ Prettier version:', stdout.trim());
});

// Test 2: Check plugin
exec('npx prettier --plugin-search-dir=. --print-config .prettierrc', (error, _stdout, _stderr) => {
	if (error) {
		console.error('❌ Error checking Prettier config:', error);
		return;
	}
	console.log('✅ Prettier config loaded successfully');
});

// Test 3: Format a test Svelte file
const testFile = path.join(__dirname, '..', 'src', 'routes', '+page.svelte');
exec(`npx prettier --check "${testFile}"`, (error, _stdout, _stderr) => {
	if (error && error.code === 1) {
		console.log('⚠️  File needs formatting (this is normal)');
	} else if (error) {
		console.error('❌ Error checking file:', error);
	} else {
		console.log('✅ File is already formatted');
	}
});

console.log('\nIf all tests pass, try these steps in VS Code:');
console.log('1. Press Ctrl+Shift+P and run "Developer: Reload Window"');
console.log('2. Open a .svelte file');
console.log('3. Press Shift+Alt+F to format');
console.log('4. If it still fails, check View > Output > Prettier for errors');
