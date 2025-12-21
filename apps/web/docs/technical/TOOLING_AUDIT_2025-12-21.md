# BuildOS Web App Tooling Audit Report

**Date:** December 21, 2025
**Scope:** `apps/web/package.json` and associated configuration files

---

## Executive Summary

This document provides a comprehensive analysis of the BuildOS web application's tooling, dependencies, and configuration. Overall, the project is **well-maintained and uses modern tooling**, but there are several areas where updates and improvements can be made.

### Priority Recommendations

| Priority  | Item                                                           | Impact             |
| --------- | -------------------------------------------------------------- | ------------------ |
| 🔴 High   | Update ESLint config to use modern `typescript-eslint` pattern | Code quality, DX   |
| 🔴 High   | Consider Vitest Browser Mode for component testing             | Test reliability   |
| 🟡 Medium | Evaluate Tailwind CSS v4 migration (wait recommended)          | Performance, DX    |
| 🟡 Medium | Update `prettier-plugin-svelte` to v4 (Svelte 5 only)          | Formatting quality |
| 🟢 Low    | Enable additional TypeScript strict options                    | Type safety        |
| 🟢 Low    | Consider Rolldown bundler experiment                           | Build performance  |

---

## 1. Core Framework Analysis

### 1.1 Svelte & SvelteKit

| Package                        | Current Version | Latest Stable | Status        |
| ------------------------------ | --------------- | ------------- | ------------- |
| `svelte`                       | ^5.37.2         | 5.37.x        | ✅ Up to date |
| `@sveltejs/kit`                | ^2.31.0         | 2.31.x        | ✅ Up to date |
| `@sveltejs/adapter-vercel`     | ^5.8.0          | 5.8.x         | ✅ Up to date |
| `@sveltejs/vite-plugin-svelte` | ^5.0.0          | 5.x           | ✅ Up to date |

**Assessment:** The project is using the latest Svelte 5 with runes syntax, which is the current best practice.

**Recommendations:**

- ✅ Continue using Svelte 5 runes (`$state`, `$derived`, `$effect`)
- ✅ The `svelte.config.js` correctly uses Node.js 22.x runtime for Vercel
- 💡 Consider enabling `svelte.config.js` runes enforcement project-wide if not already done:
    ```javascript
    // svelte.config.js
    compilerOptions: {
    	runes: true;
    }
    ```

### 1.2 Vite

| Package | Current Version | Latest Stable | Status                    |
| ------- | --------------- | ------------- | ------------------------- |
| `vite`  | ^7.1.11         | 7.3.0         | 🟡 Minor update available |

**Key Vite 7 Changes Applied:**

- ✅ Node.js 20.19+ requirement met (engines: `>=20.19.0`)
- ✅ Modern browser target configured (`es2020`)
- ✅ Manual chunks configured correctly in `rollupOptions`

**New in Vite 7 (Consider):**

1. **Rolldown Bundler (Experimental):** Drop-in replacement offering up to 16× faster builds
    - Can be tested with `rolldown-vite` package
    - Provides 100× memory reduction for large projects

2. **Baseline Browser Target:** Vite 7's new default is `baseline-widely-available`
    - Your config uses `es2020` which is fine, but consider updating for automatic browser support updates

**Recommendations:**

- 🔄 Update to Vite 7.3.0 for latest fixes
- 💡 Consider testing Rolldown bundler for build performance gains
- ⚠️ Sass legacy API removed in Vite 7 (not applicable if not using Sass)

---

## 2. TypeScript Configuration

### 2.1 Current Configuration Analysis

```json
// Current tsconfig.json highlights
{
	"target": "ES2022",
	"module": "ESNext",
	"moduleResolution": "bundler",
	"noUncheckedIndexedAccess": true,
	"incremental": true,
	"verbatimModuleSyntax": false
}
```

| Package      | Current Version | Latest Stable | Status        |
| ------------ | --------------- | ------------- | ------------- |
| `typescript` | ^5.9.2          | 5.9.x         | ✅ Up to date |

**Assessment:** The configuration is solid with good strict options enabled.

### 2.2 TypeScript 5.9 New Features

1. **`import defer` Syntax:** New ECMAScript deferred module evaluation
    - Modules only execute when exports are first accessed
    - Useful for performance optimization of large modules

2. **Improved Monorepo Support (5.8+):**
    - Better tsconfig.json search in parent directories
    - Enhanced IntelliSense for complex workspaces

### 2.3 Recommendations

**Consider enabling:**

```json
{
	"compilerOptions": {
		// Already enabled ✅
		"noUncheckedIndexedAccess": true,

		// Consider adding:
		"exactOptionalPropertyTypes": true, // Stricter optional properties
		"noImplicitOverride": true, // Require 'override' keyword

		// For Svelte - official recommendation:
		"verbatimModuleSyntax": true, // Better import handling
		"isolatedModules": true // Required for transpilers
	}
}
```

**Note:** The current `verbatimModuleSyntax: false` contradicts Svelte's official recommendation. Test with `true` for better tree-shaking.

---

## 3. ESLint Configuration

### 3.1 Current State Analysis

Your ESLint config uses the **flat config format** (ESLint 9), which is correct. However, there are improvements to make.

| Package                            | Current Version | Latest Stable | Status        |
| ---------------------------------- | --------------- | ------------- | ------------- |
| `eslint`                           | ^9.32.0         | 9.32.x        | ✅ Up to date |
| `@typescript-eslint/eslint-plugin` | ^8.38.0         | 8.38.x        | ✅ Up to date |
| `@typescript-eslint/parser`        | ^8.38.0         | 8.38.x        | ✅ Up to date |
| `eslint-plugin-svelte`             | ^3.11.0         | 3.11.x        | ✅ Up to date |
| `eslint-config-prettier`           | ^10.0.8         | 10.0.x        | ✅ Up to date |

### 3.2 Configuration Issues & Improvements

**Current config pattern (outdated):**

```javascript
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
```

**Recommended pattern (modern):**

```javascript
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true, // New in v8 - faster typed linting
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig // Auto-adjust rules based on svelte.config.js
			}
		}
	}
);
```

**Key changes:**

1. Use `typescript-eslint` package with `ts.config()` helper
2. Enable `projectService: true` for faster typed linting (stable in v8)
3. Pass `svelteConfig` for automatic rule adjustment
4. The `config()` utility was deprecated - use `ts.config()` instead

### 3.3 ESLint Recommendations

- 🔴 **Migrate to modern `typescript-eslint` pattern** - Better performance with `projectService`
- 🟡 Add Svelte-specific rules that help with Svelte 5:
    ```javascript
    rules: {
      'svelte/valid-compile': 'error',
      'svelte/no-unused-svelte-ignore': 'warn',
      'svelte/require-store-reactive-access': 'warn'
    }
    ```

---

## 4. Tailwind CSS Analysis

### 4.1 Current State

| Package                   | Current Version | Latest Stable      | Status          |
| ------------------------- | --------------- | ------------------ | --------------- |
| `tailwindcss`             | ^3.4.0          | 3.4.17 / **4.0.x** | 🟡 v4 available |
| `@tailwindcss/forms`      | ^0.5.10         | 0.5.10             | ✅ Up to date   |
| `@tailwindcss/typography` | ^0.5.16         | 0.5.16             | ✅ Up to date   |
| `autoprefixer`            | ^10.4.21        | 10.4.21            | ✅ Up to date   |
| `postcss`                 | ^8.5.6          | 8.5.6              | ✅ Up to date   |

### 4.2 Tailwind CSS v4.0 - Should You Upgrade?

**Released:** January 22, 2025

**Benefits:**

- ⚡ Up to 5× faster full builds
- ⚡ 100× faster incremental builds (400ms → 4ms)
- 📦 No more `tailwind.config.js` required
- 🎨 CSS-first configuration with `@theme` directive
- 🔍 Automatic content detection

**Breaking Changes:**

- Browser support: Safari 16.4+, Chrome 111+, Firefox 128+
- Relies on modern CSS features (`@property`, `color-mix()`)
- `@tailwind base/components/utilities` → `@import "tailwindcss";`
- Plugins like `@tailwindcss/forms` work differently

### 4.3 Tailwind v4 Migration Assessment

**Your current setup complexity:**

- ✅ Custom Inkprint design system with CSS variables
- ✅ Custom plugins (gradient text, scrollbar utilities)
- ✅ Extensive theme customization
- ⚠️ Custom `withOpacity` helper for HSL variables

**Recommendation: 🟡 Wait 2-3 months**

Reasons:

1. Your `tailwind.config.js` is highly customized (~330 lines)
2. The automated migration tool (`@tailwindcss/upgrade`) may struggle with custom configs
3. The ecosystem (plugins, tooling) is still adapting
4. v3.4 is stable and performant enough
5. Browser support requirements may exclude some users

**When to migrate:**

- Once `@tailwindcss/forms` and `@tailwindcss/typography` are v4-compatible
- After more community migration guides emerge
- If you need the performance benefits urgently

---

## 5. Testing Setup

### 5.1 Current State

| Package                     | Current Version | Latest Stable | Status        |
| --------------------------- | --------------- | ------------- | ------------- |
| `vitest`                    | ^3.2.4          | 3.2.4         | ✅ Up to date |
| `@vitest/ui`                | ^3.2.4          | 3.2.4         | ✅ Up to date |
| `@testing-library/svelte`   | ^5.2.8          | 5.2.8         | ✅ Up to date |
| `@testing-library/jest-dom` | ^6.8.0          | 6.8.0         | ✅ Up to date |
| `happy-dom`                 | ^20.0.8         | 20.0.x        | ✅ Up to date |
| `jsdom`                     | ^26.1.0         | 26.1.0        | ✅ Up to date |

### 5.2 Current Configuration Analysis

```typescript
// vitest.config.ts
test: {
  globals: true,
  environment: 'node',  // ⚠️ Default to node, not DOM
  setupFiles: ['./vitest.setup.ts'],
}
```

**Issues identified:**

1. Using `environment: 'node'` as default - component tests need DOM environment
2. Having both `happy-dom` and `jsdom` is redundant
3. Not using Vitest Browser Mode (2025 best practice)

### 5.3 Modern Testing Approach: Vitest Browser Mode

**Why switch from jsdom/happy-dom:**

- Tests run in real browsers (Playwright)
- No more mocking browser APIs
- Better Svelte 5 reactivity testing
- More reliable component behavior

**Recommended configuration:**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		// Option 1: Browser mode (recommended for 2025)
		browser: {
			enabled: true,
			provider: 'playwright',
			name: 'chromium'
		},

		// Option 2: Keep DOM emulation but pick ONE
		// environment: 'happy-dom', // Faster than jsdom

		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
```

### 5.4 Testing Recommendations

1. **🔴 Choose ONE DOM environment:** Remove either `happy-dom` or `jsdom`
    - `happy-dom` is faster, recommended for most cases
    - `jsdom` is more complete but slower

2. **🟡 Consider Vitest Browser Mode:**
    - More reliable for Svelte 5 component testing
    - CI time can be optimized with Playwright Docker containers

3. **🟢 Current `test:llm` separation is good** - keeps expensive API tests separate

---

## 6. Prettier Configuration

### 6.1 Current State

| Package                  | Current Version | Latest Stable     | Status          |
| ------------------------ | --------------- | ----------------- | --------------- |
| `prettier`               | ^3.6.2          | 3.6.2             | ✅ Up to date   |
| `prettier-plugin-svelte` | ^3.4.0          | 3.4.0 / **4.0.0** | 🟡 v4 available |

### 6.2 Prettier Plugin Svelte v4

**v4 is Svelte 5 only** and includes:

- Removed `svelteStrictMode` option
- Attributes never quoted (future Svelte syntax)
- Better Svelte 5 runes support

**Recommendation:**

- 🟡 Consider upgrading to `prettier-plugin-svelte@4` since you're on Svelte 5
- Test in a branch first to ensure formatting changes are acceptable

### 6.3 Current `.prettierrc` Analysis

```json
{
	"useTabs": true,
	"singleQuote": true,
	"trailingComma": "none",
	"printWidth": 100,
	"plugins": ["prettier-plugin-svelte"],
	"overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
}
```

**This is a valid configuration.** Consider adding Svelte-specific options:

```json
{
	"svelteIndentScriptAndStyle": true,
	"svelteAllowShorthand": true
}
```

---

## 7. Developer Tooling

### 7.1 Git Hooks & Commit Quality

| Package       | Current Version | Latest Stable | Status        |
| ------------- | --------------- | ------------- | ------------- |
| `husky`       | ^9.0.0          | 9.x           | ✅ Up to date |
| `lint-staged` | ^16.1.2         | 16.1.2        | ✅ Up to date |

**Current lint-staged config:**

```json
"lint-staged": {
  "*.{js,ts,svelte}": ["eslint --fix", "prettier --write"],
  "*.{json,md,css}": ["prettier --write"]
}
```

**This is correct for lint-staged v16+** - no `git add` needed (it's automatic now).

**Recommendation:** Add `--max-warnings=0` to fail on warnings:

```json
"*.{js,ts,svelte}": ["eslint --fix --max-warnings=0", "prettier --write"]
```

### 7.2 Concurrency & Build Tools

| Package        | Current Version | Status        |
| -------------- | --------------- | ------------- |
| `concurrently` | ^9.2.0          | ✅ Up to date |
| `tsx`          | ^4.20.3         | ✅ Up to date |

### 7.3 Bundle Analysis

| Package                    | Current Version | Status        |
| -------------------------- | --------------- | ------------- |
| `rollup-plugin-visualizer` | ^6.0.3          | ✅ Up to date |
| `vite-plugin-compression`  | ^0.5.1          | ✅ Up to date |

---

## 8. Production Dependencies Analysis

### 8.1 Key Dependencies Status

| Package                 | Current Version | Latest Stable | Notes                             |
| ----------------------- | --------------- | ------------- | --------------------------------- |
| `@supabase/supabase-js` | ^2.53.0         | 2.89.0        | 🔴 Update recommended             |
| `@supabase/ssr`         | ^0.6.1          | 0.6.x         | ✅ Up to date                     |
| `openai`                | ^5.11.0         | 5.11.x        | ✅ Up to date (v5 migration done) |
| `stripe`                | ^18.4.0         | 18.4.x        | ✅ Up to date                     |
| `date-fns`              | ^4.1.0          | 4.1.x         | ✅ Up to date                     |
| `lucide-svelte`         | ^0.536.0        | ~536.x        | ✅ Up to date                     |
| `marked`                | ^16.1.1         | 16.x          | ✅ Up to date                     |
| `googleapis`            | ^154.1.0        | 154.x         | ✅ Up to date                     |

### 8.2 Supabase SDK Update

**Current:** ^2.53.0
**Latest:** 2.89.0

**Notable changes since 2.53:**

- Node.js 18 support dropped in 2.79.0
- New X (Twitter) OAuth provider
- New publishable/secret key format available
- RSA asymmetric keys for new projects

**Recommendation:** 🔴 Update to latest - significant security improvements

### 8.3 UI Libraries

| Package          | Current Version | Notes         |
| ---------------- | --------------- | ------------- |
| `@tiptap/*`      | ^3.0.9          | ✅ Up to date |
| `@xyflow/svelte` | ^1.5.0          | ✅ Up to date |
| `cytoscape`      | ^3.33.1         | ✅ Up to date |
| `mode-watcher`   | ^1.1.0          | ✅ Up to date |
| `tailwind-merge` | ^3.3.1          | ✅ Up to date |

### 8.4 Graph Libraries Redundancy

You have multiple graph visualization libraries:

- `@antv/g6` - Graph visualization
- `@xyflow/svelte` - Flow diagrams
- `cytoscape` + plugins - Graph analysis

**Recommendation:** 🟢 Review if all are needed. Each adds to bundle size.

---

## 9. Security & Dependency Management

### 9.1 PNPM Overrides (package.json)

Your root `package.json` has security overrides for:

- `cookie@<0.7.0` → Fixed
- `brace-expansion` → Fixed
- `form-data` → Fixed
- `@eslint/plugin-kit` → Fixed
- `vite@>=7.1.0 <=7.1.10` → Fixed to 7.1.11
- `prismjs@<1.30.0` → Fixed
- `nodemailer@<7.0.11` → Fixed

**This is good practice!** Keep running `pnpm audit` regularly.

### 9.2 Engine Requirements

```json
"engines": {
  "node": ">=20.19.0",
  "pnpm": ">=8.0.0"
}
```

**Consider updating pnpm requirement:**

```json
"pnpm": ">=9.0.0"
```

This matches the root `packageManager: "pnpm@9.15.2"`.

### 9.3 Regular Maintenance Commands

```bash
# Check for outdated packages
pnpm deps:check

# Security audit
pnpm deps:audit

# Interactive update
pnpm deps:update
```

---

## 10. mdsvex (Markdown in Svelte)

| Package  | Current Version | Latest Stable | Status              |
| -------- | --------------- | ------------- | ------------------- |
| `mdsvex` | ^0.12.3         | 0.12.6        | 🟡 Update available |

**Version 0.12.5+ includes:**

- Svelte 5 syntax support in MDsveX files and layouts

**Recommendation:** Update to 0.12.6 for full Svelte 5 compatibility.

---

## 11. Summary: Action Items

### Immediate Actions (This Sprint)

1. **Update Supabase SDK:** `pnpm update @supabase/supabase-js`
2. **Update mdsvex:** `pnpm update mdsvex`
3. **Update Vite:** `pnpm update vite` (7.1.11 → 7.3.0)
4. **Remove duplicate DOM environment:** Remove either `happy-dom` or `jsdom`

### Short-Term Actions (Next Sprint)

5. **Refactor ESLint config** to use modern `typescript-eslint` pattern
6. **Update prettier-plugin-svelte** to v4 (test formatting changes first)
7. **Evaluate Vitest Browser Mode** for component testing
8. **Update pnpm engine requirement** to `>=9.0.0`

### Medium-Term Considerations (Next Quarter)

9. **Tailwind CSS v4 migration** - evaluate after ecosystem stabilizes
10. **Rolldown bundler testing** - for build performance
11. **TypeScript strict options** - enable `exactOptionalPropertyTypes`, `noImplicitOverride`

### Ongoing Maintenance

- Run `pnpm deps:audit` monthly
- Keep security overrides updated
- Review graph library usage for potential consolidation

---

## Appendix: Version Comparison Summary

| Category        | Package                | Current | Latest | Action      |
| --------------- | ---------------------- | ------- | ------ | ----------- |
| **Framework**   | svelte                 | 5.37.2  | 5.37.x | ✅ None     |
|                 | @sveltejs/kit          | 2.31.0  | 2.31.x | ✅ None     |
| **Build**       | vite                   | 7.1.11  | 7.3.0  | 🟡 Update   |
|                 | typescript             | 5.9.2   | 5.9.x  | ✅ None     |
| **Lint/Format** | eslint                 | 9.32.0  | 9.32.x | ✅ None     |
|                 | prettier               | 3.6.2   | 3.6.x  | ✅ None     |
|                 | prettier-plugin-svelte | 3.4.0   | 4.0.0  | 🟡 Evaluate |
| **Styling**     | tailwindcss            | 3.4.0   | 4.0.x  | 🟡 Wait     |
| **Testing**     | vitest                 | 3.2.4   | 3.2.x  | ✅ None     |
|                 | happy-dom              | 20.0.8  | 20.0.x | ✅ None     |
| **Backend**     | @supabase/supabase-js  | 2.53.0  | 2.89.0 | 🔴 Update   |
|                 | openai                 | 5.11.0  | 5.11.x | ✅ None     |
| **Tooling**     | mdsvex                 | 0.12.3  | 0.12.6 | 🟡 Update   |
|                 | husky                  | 9.0.0   | 9.x    | ✅ None     |

---

_Generated by Claude Code on December 21, 2025_
