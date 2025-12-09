<!-- apps/web/docs/technical/deployment/BUILD.md -->

# Build Process Documentation

This document explains the various build scripts and logging options available in this project.

## Build Commands

### Standard Build

```bash
pnpm run build
```

Runs the standard Vite build process.

### Build with Comprehensive Logging

#### Option 1: TypeScript Build Script (Cross-platform)

```bash
pnpm run build:log
```

This runs a TypeScript script that:

- Executes svelte-kit sync
- Runs svelte-check for type checking
- Runs ESLint for code quality
- Runs the Vite build
- Captures ALL output (stdout and stderr) to `build-logs.log`
- Shows colored output in the console
- Provides a summary at the end

#### Option 2: PowerShell Script (Windows)

```bash
pnpm run build:log:ps
```

Or directly:

```powershell
.\build-with-log.ps1
```

#### Option 3: Batch Script (Windows)

```cmd
build-with-log.bat
```

Note: Requires `tee` command to be available (comes with Git Bash or can be installed separately).

#### Option 4: Simple Verbose Build

```bash
pnpm run build:verbose
```

Runs Vite build with verbose logging and pipes output to `build-logs.log`.

## Log File

All build scripts create a `build-logs.log` file in the project root that contains:

- Timestamp of the build
- Output from each build step
- All warnings and errors
- Build summary with success/failure status

## Understanding the Build Process

The comprehensive build process includes:

1. **svelte-kit sync** - Generates TypeScript definitions
2. **svelte-check** - Type checking for Svelte components
3. **ESLint** - Code quality and style checking
4. **Vite build** - The actual production build

## Interpreting Build Logs

Look for these patterns in the logs:

- `[vite-plugin-svelte]` - Svelte-specific warnings/errors
- `https://svelte.dev/e/` - Links to Svelte error documentation
- `Warning:` or `warning` - Non-critical issues
- `Error:` or `error` - Critical issues that may prevent building
- Exit codes - Non-zero exit codes indicate failures

## Common Issues

### Accessibility Warnings

- `a11y_label_has_associated_control` - Labels need to be associated with form controls
- `a11y_no_static_element_interactions` - Interactive elements need appropriate ARIA roles

### HTML Warnings

- `element_invalid_self_closing_tag` - Non-void elements shouldn't be self-closing

### TypeScript Warnings

- `export_let_unused` - Component props that aren't used

## Continuous Integration

For CI/CD pipelines, use:

```bash
pnpm run build:log
```

This will:

- Exit with code 1 on failure
- Exit with code 0 on success
- Generate comprehensive logs for debugging
