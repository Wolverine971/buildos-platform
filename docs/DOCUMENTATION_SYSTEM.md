# BuildOS Documentation System

*Comprehensive automated documentation generation and maintenance system*

## Overview

BuildOS now features a fully automated documentation system that keeps documentation in sync with code changes. The system generates, validates, and maintains documentation across all aspects of the codebase.

## Quick Start

### Generate All Documentation
```bash
# Generate all documentation at once
pnpm run docs:generate

# Generate and validate everything
pnpm run docs:full

# Watch for changes during development
pnpm run docs:watch
```

### Individual Generators
```bash
# Database schema documentation
pnpm run gen:schema

# API route documentation
pnpm run gen:api-docs

# Svelte component documentation
pnpm run gen:component-docs

# Architecture Decision Records
pnpm run gen:adr-index

# Monitoring and operations documentation
pnpm run gen:monitoring-docs
```

## Documentation Categories

### 1. API Documentation (`docs/technical/api/`)
- **Routes Reference**: Complete list of all API endpoints
- **Type Definitions**: TypeScript interfaces and types
- **Interactive Docs**: Swagger UI for testing endpoints
- **Request/Response Templates**: Standard formats and examples

**Generated from:**
- `/src/routes/api/**/*.ts` - API route files
- `/src/lib/types/**/*.ts` - Type definitions
- `/src/lib/database.schema.ts` - Database types

### 2. Component Documentation (`docs/technical/components/`)
- **Design System**: Svelte 5 patterns and architecture
- **Component Catalog**: Individual component documentation
- **Runes Usage**: Svelte 5 state management patterns
- **Dependencies**: Component relationship mapping

**Generated from:**
- `/src/lib/components/**/*.svelte` - Component files
- JSDoc comments and prop definitions
- Svelte 5 runes usage analysis

### 3. Architecture Documentation (`docs/technical/architecture/`)
- **ADR Index**: Architecture Decision Records
- **Decision Templates**: Standardized decision documentation
- **System Overview**: High-level architecture diagrams
- **Design Patterns**: Common patterns and practices

**Generated from:**
- `/docs/technical/architecture/decisions/*.md` - Existing ADRs
- Codebase analysis for architectural patterns

### 4. Monitoring Documentation (`docs/technical/deployment/`)
- **Metrics Reference**: Complete list of tracked metrics
- **Alerts Guide**: Alert thresholds and procedures
- **Runbooks**: Operational response procedures
- **Performance Monitoring**: System health dashboards

**Generated from:**
- System configuration analysis
- Monitoring setup and alert definitions
- Operational procedures and best practices

### 5. Database Documentation (`docs/technical/database/`)
- **Schema Documentation**: Complete database schema
- **Type Definitions**: Generated TypeScript types
- **Migration Guides**: Schema change procedures
- **Query Examples**: Common database operations

**Generated from:**
- `/src/lib/database.schema.ts` - Schema definitions
- `/src/lib/database.types.ts` - Type definitions

## Automation Features

### GitHub Actions Integration

Documentation is automatically generated on:
- Push to `main` or `develop` branches
- Changes to API routes, schemas, or components
- Pull request creation

The CI pipeline:
1. Generates updated documentation
2. Validates all links and references
3. Checks documentation coverage
4. Commits changes automatically

### Development Watching

During development, the watch system monitors:
- API route changes → Regenerates API docs
- Component changes → Updates component docs
- Schema changes → Regenerates database docs
- ADR changes → Updates architecture index

### Validation and Quality Checks

The system includes comprehensive validation:
- **Link Validation**: Checks all internal and external links
- **Coverage Analysis**: Ensures all code is documented
- **Format Verification**: Maintains consistent documentation style
- **Cross-reference Integrity**: Validates document relationships

## Scripts Reference

### Generation Scripts

| Script | Purpose | Source Files |
|--------|---------|--------------|
| `gen:api-docs` | API endpoint documentation | `/src/routes/api/**/*.ts` |
| `gen:component-docs` | Svelte component docs | `/src/lib/components/**/*.svelte` |
| `gen:schema` | Database schema docs | `/src/lib/database.schema.ts` |
| `gen:adr-index` | Architecture decisions | `/docs/technical/architecture/decisions/` |
| `gen:monitoring-docs` | Operational documentation | System configuration |
| `gen:docs-master` | Master coordinator | All documentation |

### Watch Scripts

| Script | Purpose | Watched Files |
|--------|---------|---------------|
| `docs:watch` | Watch all documentation | Multiple patterns |
| `watch:schema` | Database schema only | Schema and type files |
| `watch:api` | API routes only | `/src/routes/api/` |
| `watch:components` | Components only | `/src/lib/components/` |

### Validation Scripts

| Script | Purpose | Scope |
|--------|---------|-------|
| `validate:docs-links` | Check all links | All documentation files |
| `check:docs-coverage` | Coverage analysis | Entire codebase |
| `lint:docs` | Format validation | Markdown files |
| `docs:validate` | Complete validation | All checks combined |

## Configuration

### GitHub Actions

The documentation workflow (`.github/workflows/docs.yml`) is configured to:
- Run on code changes affecting documentation
- Generate comprehensive reports
- Automatically commit updates
- Validate changes in pull requests

### Watch Configuration

The watch system can be customized in `/scripts/watch-docs.ts`:
- Add new file patterns to monitor
- Adjust debounce timings
- Configure generation scripts per pattern

### Output Structure

Documentation is organized following the [Architecture Reorganization Plan](./ARCHITECTURE_REORGANIZATION_PLAN.md):

```
docs/
├── technical/           # Technical documentation
│   ├── api/            # API documentation
│   ├── components/     # Component documentation
│   ├── architecture/   # Architecture decisions
│   ├── database/       # Database documentation
│   └── deployment/     # Operations and monitoring
├── business/           # Business documentation
├── user-guide/         # End-user documentation
└── reports/           # Generation reports
```

## Best Practices

### Writing Documentable Code

To ensure high-quality generated documentation:

1. **Use JSDoc Comments**:
   ```typescript
   /**
    * Processes a brain dump and extracts actionable tasks
    * @param input - The raw brain dump text
    * @param options - Processing configuration
    * @returns Structured project and task data
    */
   export async function processBrainDump(input: string, options: ProcessingOptions) {
     // Implementation
   }
   ```

2. **Document Component Props**:
   ```svelte
   <script lang="ts">
   /**
    * @component BrainDumpModal
    * @description Main interface for capturing and processing brain dumps
    */

   interface Props {
     /** Whether the modal is currently open */
     open: boolean;
     /** Callback when processing completes */
     onComplete: (result: BrainDumpResult) => void;
   }

   let { open, onComplete }: Props = $props();
   </script>
   ```

3. **Maintain Clear API Responses**:
   ```typescript
   // In API routes, use consistent response patterns
   export async function GET({ params }) {
     try {
       const data = await getProject(params.id);
       return json({ success: true, data });
     } catch (error) {
       return json({
         success: false,
         error: { message: error.message }
       }, { status: 500 });
     }
   }
   ```

### Documentation Maintenance

1. **Regular Reviews**: Schedule monthly documentation reviews
2. **Update ADRs**: Document architectural decisions as they're made
3. **Validate Links**: Run validation before major releases
4. **Monitor Coverage**: Aim for >80% documentation coverage

## Troubleshooting

### Common Issues

**Generation Fails with Type Errors**
```bash
# Fix TypeScript errors first
pnpm run check

# Then regenerate documentation
pnpm run docs:generate
```

**Watch Script Not Responding**
```bash
# Restart the watch process
# Kill existing process and restart
pnpm run docs:watch
```

**Broken Links After Refactoring**
```bash
# Validate and fix links
pnpm run validate:docs-links

# Check what needs documentation
pnpm run check:docs-coverage
```

### Performance Optimization

For large codebases:
- Use `--skip-optional` to skip non-critical documentation
- Run generation in parallel with `--parallel` flag
- Focus on specific categories with `--categories` option

```bash
# Fast generation for development
pnpm run gen:docs-master -- --skip-optional --parallel

# Only update API docs
pnpm run gen:docs-master -- --categories api
```

## Integration with Development Workflow

### Pre-commit Hooks

Add to `.husky/pre-commit`:
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Generate documentation for changed files
pnpm run docs:validate
```

### IDE Integration

Configure your IDE to run documentation generation on file save for rapid feedback during development.

### Pull Request Templates

Include documentation checks in PR templates:
```markdown
## Documentation
- [ ] Updated relevant documentation
- [ ] Ran `pnpm run docs:validate`
- [ ] Verified all links work
- [ ] Added examples for new features
```

## Extending the System

### Adding New Generators

1. Create generator script in `/scripts/`
2. Add to `package.json` scripts
3. Include in master generator
4. Update GitHub Actions workflow
5. Add validation if needed

### Custom Documentation Types

The system is extensible for new documentation types:
- Business process documentation
- User guides and tutorials
- API client libraries
- Integration guides

---

*This documentation system ensures BuildOS maintains high-quality, up-to-date documentation that evolves with the codebase.*