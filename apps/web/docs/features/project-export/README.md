<!-- apps/web/docs/features/project-export/README.md -->

# Project Export

Browser-native PDF export for project context and data.

## Overview

Enables users to export project context as PDFs using the browser's native print functionality. Replaced a heavy server-side Puppeteer/Chromium approach with a zero-dependency browser-native solution.

## Status

**Implemented** (October 2025)

## Key Documents

- [Browser Print Implementation](BROWSER_PRINT_IMPLEMENTATION.md) - Implementation details for the browser-native print approach
- [PDF Export Migration Session](PDF_EXPORT_MIGRATION_SESSION.md) - Migration from server-side to browser-native

## Key Features

- Zero-dependency PDF generation via browser print
- CSS-optimized print layouts
- Eliminated ~150MB Puppeteer dependency

## Related

- `/apps/web/docs/features/ontology/` - Project data source
