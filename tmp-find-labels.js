// tmp-find-labels.js
const fs = require('fs');
const path = require('path');

function* walk(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walk(fullPath);
		} else if (fullPath.endsWith('.svelte')) {
			yield fullPath;
		}
	}
}

const root = path.resolve(process.argv[2] || 'apps/web/src');
const files = Array.from(walk(root));
const problematic = new Map();
const controlPattern =
	/<\s*(input|select|textarea|button|TextInput|Textarea|Select|Radio|RadioGroup|Checkbox|Switch|Toggle|DatePicker|TimePicker|NumberInput|Slider|SegmentedControl|FileInput|RangeSlider|FormField|Fieldset|Combobox|Typeahead|Autocomplete|TextArea|MultiSelect|ComboBox|InputField)\b/i;
const labelRegex = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;

for (const file of files) {
	const content = fs.readFileSync(file, 'utf8');
	let match;
	while ((match = labelRegex.exec(content)) !== null) {
		const attrs = match[1];
		const inner = match[2];
		if (/for\s*=/.test(attrs)) continue;
		if (controlPattern.test(inner)) continue;
		const line = content.slice(0, match.index).split(/\r?\n/).length;
		if (!problematic.has(file)) {
			problematic.set(file, []);
		}
		problematic.get(file).push({ line, snippet: match[0].trim().slice(0, 160) });
	}
}

for (const [file, entries] of problematic) {
	console.log(`${path.relative(process.cwd(), file)}:`);
	for (const { line, snippet } of entries) {
		console.log(`  line ${line}: ${snippet}`);
	}
	console.log();
}
