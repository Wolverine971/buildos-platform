---
title: "Project Context Document Pretty-Print Tool - Technical Specification"
date: 2025-10-14
author: Claude Code
status: draft
tags: [feature-spec, export, pdf-generation, design-system]
related:
  - /apps/web/src/lib/components/project/ProjectContextDocModal.svelte
  - /apps/web/tailwind.config.js
---

# Project Context Document Pretty-Print Tool - Technical Specification

## Executive Summary

This specification outlines the design and implementation of an elegant PDF/HTML export feature for BuildOS project context documents. The tool will transform markdown-formatted project context into beautifully typeset documents that match the quality and aesthetic of high-end Apple PRD handouts.

**Vision**: Enable users to export project context documents as professional, print-ready PDFs with a single click.

---

## 1. Feature Overview

### 1.1 Goals

- **Primary**: Generate elegant, professionally formatted PDF exports of project context documents
- **Secondary**: Provide HTML preview option for quick viewing
- **Tertiary**: Maintain BuildOS brand identity through subtle, tasteful design

### 1.2 User Experience

1. User opens Project Context Document modal (existing: `ProjectContextDocModal.svelte`)
2. User clicks new "Export PDF" button in modal header
3. System generates PDF with loading indicator
4. Browser downloads beautifully formatted PDF document
5. Optional: User can preview HTML version before downloading PDF

### 1.3 Non-Goals (Out of Scope)

- Batch export of multiple projects
- Customizable themes/templates (future enhancement)
- Email integration
- Cloud storage integration
- Collaborative editing in export view

---

## 2. Design Specifications

### 2.1 Visual Design Principles

Inspired by Apple's Human Interface Guidelines and PRD design language:

#### Typography

- **Primary Font**: SF Pro Display for headings (fallback: system-ui, -apple-system)
- **Body Font**: SF Pro Text for body content (fallback: system-ui, -apple-system)
- **Hierarchy**:
  - Project Name: 28pt, Bold, #1e3a8a (primary-900)
  - H1: 24pt, Semibold, #1e40af (primary-800)
  - H2: 20pt, Semibold, #2563eb (primary-600)
  - H3: 16pt, Medium, #3b82f6 (primary-500)
  - Body: 11pt, Regular, #374151 (gray-700)
  - Metadata: 9pt, Regular, #6b7280 (gray-500)

#### Layout

- **Page Size**: A4 (210mm × 297mm)
- **Margins**:
  - Top: 25mm (includes header space)
  - Right: 20mm
  - Bottom: 20mm
  - Left: 25mm
- **Content Width**: 165mm
- **Line Height**: 1.6 for body text, 1.3 for headings
- **Paragraph Spacing**: 0.8em between paragraphs

#### Color Palette (BuildOS Theme)

```css
/* Primary Blues */
--primary-50: #eff6ff;
--primary-100: #dbeafe;
--primary-500: #3b82f6;
--primary-600: #2563eb;
--primary-800: #1e40af;
--primary-900: #1e3a8a;

/* Grays */
--gray-50: #f9fafb;
--gray-100: #f3f4f6;
--gray-500: #6b7280;
--gray-700: #374151;
--gray-900: #111827;

/* Accent */
--accent-blue: #3b82f6;
```

#### White Space Philosophy

- Generous margins create breathing room
- Empty space = elegance
- Content-to-white-space ratio: ~60:40
- Clear visual separation between sections

### 2.2 Document Structure

```
┌─────────────────────────────────────────┐
│  [Brain-bolt logo]     [Header Area]    │  ← Top right logo (subtle, 18mm)
│                                         │
│  PROJECT NAME                           │  ← 28pt Bold
│  Active • Started Oct 14, 2025          │  ← 9pt metadata
│                                         │
│  ─────────────────────────────────────  │  ← Subtle divider
│                                         │
│  ## Context Section Heading             │  ← Markdown H2
│                                         │
│  Body text of the context document      │  ← 11pt body
│  with proper line spacing and margins.  │
│  Supports all markdown formatting:      │
│                                         │
│  - Bullet lists with proper indent      │
│  - Numbered lists                       │
│  - **Bold** and *italic* text          │
│  - Code blocks with syntax highlighting │
│  - Tables with clean borders            │
│  - Blockquotes with left border         │
│                                         │
│  [... content continues ...]            │
│                                         │
│                        Page 1 of 3  ──┐ │  ← Footer
└─────────────────────────────────────────┘
```

### 2.3 Component Details

#### Header (Top of First Page Only)

```
┌─────────────────────────────────────────┐
│                    [brain-bolt logo]    │  18mm × 18mm, opacity 0.8
│                                         │
│  Project Name Here                      │  28pt Bold, primary-900
│  Active • Started Oct 14, 2025          │  9pt Regular, gray-500
│  Due Dec 31, 2025                       │  (if dates exist)
│                                         │
│  ─────────────────────────────────      │  1px solid, gray-200
└─────────────────────────────────────────┘
```

**Logo Specifications**:

- Position: Absolute, top: 20mm, right: 20mm
- Size: 18mm × 18mm (approximately 51pt × 51pt)
- Source: `/static/brain-bolt.png`
- Opacity: 0.8 (subtle, not overpowering)
- Image treatment: Grayscale or subtle blue tint

**Project Metadata**:

- Status badge: Colored dot + text (Active = emerald, Paused = amber, Completed = primary)
- Dates: Only show if they exist
- Format: "Started MMM DD, YYYY" or "Due MMM DD, YYYY"

#### Body Content

- Markdown rendered to HTML with custom CSS
- Use `@tailwindcss/typography` styles as base
- Custom overrides for PDF-specific adjustments:
  - No link underlines (show URLs in footnotes if needed)
  - Code blocks: Light gray background, monospace font
  - Lists: Proper indentation (20pt per level)
  - Tables: Borders with gray-200, zebra striping optional

#### Footer (All Pages)

```
┌─────────────────────────────────────────┐
│                        Page 1 of 3      │  9pt Regular, gray-500
│  Generated by BuildOS                   │  Centered or right-aligned
└─────────────────────────────────────────┘
```

### 2.4 Design Mockup Reference

**Inspiration Sources**:

- Apple Product Requirements Documents
- Apple Human Interface Guidelines layouts
- Minimalist technical documentation (e.g., Stripe API docs, Linear product specs)

**Key Visual Attributes**:

- ✅ Clean, uncluttered layout
- ✅ Clear visual hierarchy
- ✅ Professional typography
- ✅ Subtle brand presence (not overpowering)
- ✅ Print-ready quality (high DPI)

---

## 3. Technical Architecture

### 3.1 Technology Stack Decision Matrix

| Tool                    | Pros                                                            | Cons                                               | Verdict                 |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| **Pandoc + WeasyPrint** | Full CSS control, great typography, template-based, open source | Requires Python dependency, server-side processing | ✅ **RECOMMENDED**      |
| Pandoc + Typst          | Modern, good quality, simpler than LaTeX                        | Less familiar than CSS, newer ecosystem            | ⚠️ Alternative          |
| Puppeteer/Playwright    | Easy integration with Node, CSS support                         | Heavy runtime, slower generation                   | ❌ Too heavy            |
| jsPDF + HTML2Canvas     | Pure JS, no backend needed                                      | Poor typography, quality issues                    | ❌ Quality insufficient |
| Prince XML              | Excellent quality, professional-grade                           | Commercial license required ($$$)                  | ❌ Cost prohibitive     |

**Decision**: **Pandoc + WeasyPrint** for production, with HTML-only preview as fallback.

### 3.2 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (SvelteKit)                     │
│                                                              │
│  ProjectContextDocModal.svelte                              │
│  ┌──────────────────────────────────────┐                  │
│  │  [Export PDF ▼]  ← Dropdown button   │                  │
│  │    • Download PDF                    │                  │
│  │    • Preview HTML                    │                  │
│  └──────────────────────────────────────┘                  │
│           │                      │                          │
│           │ POST /api/          │ GET /api/                │
│           │ projects/:id/        │ projects/:id/            │
│           │ export/pdf           │ export/preview           │
│           ▼                      ▼                          │
└─────────────────────────────────────────────────────────────┘
                    │                      │
┌───────────────────┴──────────────────────┴─────────────────┐
│                    API Routes (SvelteKit)                   │
│                                                              │
│  /api/projects/[id]/export/                                │
│  ├── pdf/+server.ts        ← PDF generation endpoint       │
│  └── preview/+server.ts    ← HTML preview endpoint         │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────────────────────────────┐              │
│  │   ProjectExportService                   │              │
│  │   (/lib/services/export/)                │              │
│  │                                           │              │
│  │   • fetchProjectData()                   │              │
│  │   • generateHTML()                       │              │
│  │   • generatePDF() ← Pandoc + WeasyPrint │              │
│  │   • applyTemplate()                      │              │
│  └──────────────────────────────────────────┘              │
│           │                                                  │
└───────────┼──────────────────────────────────────────────────┘
            │
┌───────────┴──────────────────────────────────────────────────┐
│                    Template System                            │
│                                                              │
│  /lib/templates/export/                                     │
│  ├── context-doc.html        ← Pandoc HTML template        │
│  ├── context-doc.css         ← PDF stylesheet              │
│  ├── preview.html            ← HTML preview template       │
│  └── assets/                                                │
│      └── brain-bolt-logo.png                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│              External Dependencies (Server)                  │
│                                                              │
│  • Pandoc CLI (markdown → HTML conversion)                  │
│  • WeasyPrint (HTML + CSS → PDF)                           │
│  • Python 3.9+ (WeasyPrint runtime)                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 File Structure

```
apps/web/
├── src/
│   ├── lib/
│   │   ├── services/
│   │   │   └── export/
│   │   │       ├── project-export.service.ts    ← Main service
│   │   │       ├── template-renderer.ts         ← Template engine
│   │   │       ├── pdf-generator.ts             ← Pandoc/WeasyPrint wrapper
│   │   │       └── markdown-processor.ts        ← Markdown preprocessing
│   │   │
│   │   ├── templates/
│   │   │   └── export/
│   │   │       ├── context-doc.html             ← Pandoc template
│   │   │       ├── context-doc.css              ← PDF styles
│   │   │       ├── preview.html                 ← HTML preview template
│   │   │       └── assets/
│   │   │           └── brain-bolt-export.png    ← Optimized logo
│   │   │
│   │   └── components/
│   │       └── project/
│   │           └── ProjectContextDocModal.svelte  ← Updated UI
│   │
│   └── routes/
│       └── api/
│           └── projects/
│               └── [id]/
│                   └── export/
│                       ├── pdf/
│                       │   └── +server.ts       ← PDF endpoint
│                       └── preview/
│                           └── +server.ts       ← HTML preview endpoint
│
├── static/
│   └── brain-bolt.png                          ← Original logo
│
└── scripts/
    └── setup-export-tools.sh                   ← Install dependencies
```

---

## 4. Implementation Plan

### 4.1 Phase 1: Foundation (Day 1-2)

**Tasks**:

1. ✅ Research and specification (this document)
2. Set up development environment
   - Install Pandoc locally
   - Install WeasyPrint via pip
   - Test basic conversion pipeline
3. Create template system foundation
   - Create `/lib/templates/export/` directory
   - Design HTML template with placeholders
   - Create CSS stylesheet with BuildOS theme
4. Prepare logo asset
   - Optimize brain-bolt.png for PDF embedding
   - Create grayscale/tinted version at correct size

**Deliverables**:

- Working Pandoc + WeasyPrint pipeline (local test)
- HTML template with BuildOS styling
- CSS file with typography and layout
- Optimized logo asset

### 4.2 Phase 2: Backend Implementation (Day 3-4)

**Tasks**:

1. Create service layer
   - `project-export.service.ts`: Main orchestrator
   - `pdf-generator.ts`: Pandoc/WeasyPrint wrapper
   - `template-renderer.ts`: Template variable substitution
   - `markdown-processor.ts`: Preprocessing and sanitization
2. Create API endpoints
   - `/api/projects/[id]/export/pdf/+server.ts`
   - `/api/projects/[id]/export/preview/+server.ts`
3. Implement error handling
   - Graceful degradation if Pandoc/WeasyPrint unavailable
   - Validation for project ID and permissions
   - File size limits and timeouts
4. Write unit tests
   - Service layer tests
   - Template rendering tests
   - Mock Pandoc/WeasyPrint calls

**Deliverables**:

- Functional API endpoints
- Service layer with dependency injection
- Comprehensive error handling
- Unit test coverage >80%

### 4.3 Phase 3: Frontend Integration (Day 5)

**Tasks**:

1. Update `ProjectContextDocModal.svelte`
   - Add "Export" dropdown button in header
   - Implement PDF download trigger
   - Add HTML preview option
   - Show loading state during generation
   - Display success/error toast messages
2. Create loading/progress UI
   - Loading spinner or progress bar
   - Estimated time remaining (optional)
3. Handle browser download
   - Proper filename: `{project-slug}-context.pdf`
   - Content-Disposition headers
   - MIME type: `application/pdf`
4. Error handling and user feedback
   - Show friendly error messages
   - Retry mechanism
   - Link to troubleshooting docs

**Deliverables**:

- Updated modal UI with export button
- Smooth UX for PDF generation
- Proper error states and messaging
- Browser download functionality

### 4.4 Phase 4: Polish & Testing (Day 6-7)

**Tasks**:

1. Typography refinement
   - Test on real project context documents
   - Adjust font sizes, spacing, margins
   - Ensure readability at print scale
2. Logo placement and branding
   - Fine-tune logo size and opacity
   - Verify BuildOS colors match brand
   - Test header/footer layouts
3. Cross-browser testing
   - Chrome, Firefox, Safari
   - Mobile responsiveness (HTML preview)
4. Print testing
   - Test PDF print output on physical printer
   - Verify page breaks, margins, colors
5. Performance optimization
   - Measure generation time
   - Implement caching if needed
   - Optimize CSS and templates
6. Documentation
   - Update README with setup instructions
   - Create troubleshooting guide
   - Document API endpoints

**Deliverables**:

- Polished, production-ready feature
- Cross-browser compatibility
- Performance benchmarks
- Complete documentation

### 4.5 Phase 5: Deployment (Day 8)

**Tasks**:

1. Environment setup
   - Install Pandoc on Vercel/production server
   - Configure Python/WeasyPrint runtime
   - Set environment variables
2. Deployment checklist
   - Database migrations (if needed)
   - Feature flag setup
   - Monitoring and logging
3. Rollout strategy
   - Beta testing with select users
   - Gradual rollout
   - Monitor error rates
4. Post-launch monitoring
   - Track usage metrics
   - Monitor generation times
   - Collect user feedback

**Deliverables**:

- Production-ready deployment
- Monitoring dashboard
- User feedback collection

---

## 5. Detailed Implementation Specifications

### 5.1 Service Layer: `project-export.service.ts`

```typescript
/**
 * Project Export Service
 * Handles generation of PDF and HTML exports for project context documents
 */

import type { Project } from "$lib/types/project";
import { TemplateRenderer } from "./template-renderer";
import { PDFGenerator } from "./pdf-generator";
import { MarkdownProcessor } from "./markdown-processor";

export class ProjectExportService {
  private templateRenderer: TemplateRenderer;
  private pdfGenerator: PDFGenerator;
  private markdownProcessor: MarkdownProcessor;

  constructor() {
    this.templateRenderer = new TemplateRenderer();
    this.pdfGenerator = new PDFGenerator();
    this.markdownProcessor = new MarkdownProcessor();
  }

  /**
   * Generate PDF export of project context document
   */
  async exportToPDF(projectId: string, userId: string): Promise<Buffer> {
    // 1. Fetch project data with permissions check
    const project = await this.fetchProjectWithPermissions(projectId, userId);

    // 2. Preprocess markdown content
    const processedContext = await this.markdownProcessor.process(
      project.context || "",
    );

    // 3. Render HTML from template
    const html = await this.templateRenderer.render("context-doc", {
      project: {
        name: project.name,
        status: project.status,
        startDate: project.start_date,
        endDate: project.end_date,
        context: processedContext,
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: "BuildOS",
      },
    });

    // 4. Convert HTML to PDF using Pandoc + WeasyPrint
    const pdfBuffer = await this.pdfGenerator.generatePDF(html, {
      cssPath: "/lib/templates/export/context-doc.css",
      logoPath: "/lib/templates/export/assets/brain-bolt-export.png",
    });

    return pdfBuffer;
  }

  /**
   * Generate HTML preview of project context document
   */
  async exportToHTML(projectId: string, userId: string): Promise<string> {
    const project = await this.fetchProjectWithPermissions(projectId, userId);

    const processedContext = await this.markdownProcessor.process(
      project.context || "",
    );

    const html = await this.templateRenderer.render("preview", {
      project: {
        name: project.name,
        status: project.status,
        startDate: project.start_date,
        endDate: project.end_date,
        context: processedContext,
      },
    });

    return html;
  }

  /**
   * Fetch project with permissions check
   */
  private async fetchProjectWithPermissions(
    projectId: string,
    userId: string,
  ): Promise<Project> {
    // Implementation: Query Supabase with RLS check
    // Throw error if unauthorized or not found
  }
}
```

### 5.2 PDF Generator: `pdf-generator.ts`

```typescript
/**
 * PDF Generator
 * Wrapper around Pandoc and WeasyPrint for PDF generation
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

interface PDFOptions {
  cssPath: string;
  logoPath: string;
  pageSize?: "A4" | "Letter";
  timeout?: number; // milliseconds
}

export class PDFGenerator {
  /**
   * Generate PDF from HTML string using WeasyPrint
   */
  async generatePDF(html: string, options: PDFOptions): Promise<Buffer> {
    const tempDir = await this.createTempDirectory();
    const htmlPath = path.join(tempDir, "document.html");
    const pdfPath = path.join(tempDir, "document.pdf");

    try {
      // 1. Write HTML to temp file
      await writeFile(htmlPath, html, "utf-8");

      // 2. Run WeasyPrint command
      const command = this.buildWeasyPrintCommand(htmlPath, pdfPath, options);
      const { stdout, stderr } = await execAsync(command, {
        timeout: options.timeout || 30000, // 30 second default timeout
      });

      if (stderr && stderr.includes("ERROR")) {
        throw new Error(`WeasyPrint error: ${stderr}`);
      }

      // 3. Read generated PDF
      const pdfBuffer = await readFile(pdfPath);

      // 4. Clean up temp files
      await this.cleanupTempDirectory(tempDir);

      return pdfBuffer;
    } catch (error) {
      // Clean up on error
      await this.cleanupTempDirectory(tempDir);
      throw error;
    }
  }

  /**
   * Build WeasyPrint command with options
   */
  private buildWeasyPrintCommand(
    htmlPath: string,
    pdfPath: string,
    options: PDFOptions,
  ): string {
    const cssOption = options.cssPath ? `--stylesheet ${options.cssPath}` : "";
    const pageSize = options.pageSize || "A4";

    return `weasyprint ${htmlPath} ${pdfPath} ${cssOption} --media-type print --page-size ${pageSize}`;
  }

  /**
   * Create temporary directory for file operations
   */
  private async createTempDirectory(): Promise<string> {
    const tempDir = path.join(os.tmpdir(), `buildos-export-${Date.now()}`);
    await execAsync(`mkdir -p ${tempDir}`);
    return tempDir;
  }

  /**
   * Clean up temporary directory
   */
  private async cleanupTempDirectory(tempDir: string): Promise<void> {
    try {
      await execAsync(`rm -rf ${tempDir}`);
    } catch (error) {
      console.error("Failed to cleanup temp directory:", error);
      // Don't throw - cleanup failure shouldn't break the export
    }
  }

  /**
   * Check if WeasyPrint is installed and available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execAsync("weasyprint --version");
      return true;
    } catch {
      return false;
    }
  }
}
```

### 5.3 Template: `context-doc.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{project.name}} - Context Document</title>
    <style>
      /* External CSS will be injected by WeasyPrint */
    </style>
  </head>
  <body>
    <!-- Header (First Page Only) -->
    <header class="document-header">
      <div class="logo-container">
        <img src="{{logoPath}}" alt="BuildOS" class="brand-logo" />
      </div>

      <h1 class="project-name">{{project.name}}</h1>

      <div class="project-metadata">
        <span class="status-badge status-{{project.status}}">
          <span class="status-dot"></span>
          {{project.status}}
        </span>

        {{#if project.startDate}}
        <span class="metadata-item">
          Started {{formatDate project.startDate}}
        </span>
        {{/if}} {{#if project.endDate}}
        <span class="metadata-item"> Due {{formatDate project.endDate}} </span>
        {{/if}}
      </div>

      <hr class="header-divider" />
    </header>

    <!-- Main Content -->
    <main class="document-content">
      <article class="prose">{{{project.context}}}</article>
    </main>

    <!-- Footer (All Pages) -->
    <footer class="document-footer">
      <div class="footer-content">
        <span class="page-number"
          >Page <span class="page-counter"></span> of
          <span class="page-total"></span
        ></span>
        <span class="footer-brand">Generated by BuildOS</span>
      </div>
    </footer>
  </body>
</html>
```

### 5.4 Stylesheet: `context-doc.css`

```css
/**
 * BuildOS Project Context Document Stylesheet
 * Apple-inspired minimalist design for PDF exports
 */

/* ========================================
   Page Setup
   ======================================== */

@page {
  size: A4;
  margin: 25mm 20mm 20mm 25mm;

  @top-right {
    content: "";
  }

  @bottom-center {
    content: "Page " counter(page) " of " counter(pages);
    font-family:
      "SF Pro Text",
      -apple-system,
      system-ui,
      sans-serif;
    font-size: 9pt;
    color: #6b7280;
  }
}

/* First page has larger top margin for header */
@page :first {
  margin-top: 25mm;
}

/* ========================================
   Typography
   ======================================== */

:root {
  /* BuildOS Colors */
  --primary-50: #eff6ff;
  --primary-100: #dbeafe;
  --primary-500: #3b82f6;
  --primary-600: #2563eb;
  --primary-800: #1e40af;
  --primary-900: #1e3a8a;

  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-500: #6b7280;
  --gray-700: #374151;
  --gray-900: #111827;

  /* Typography */
  --font-display:
    "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-body:
    "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "SF Mono", Menlo, Monaco, "Courier New", monospace;
}

* {
  box-sizing: border-box;
}

body {
  font-family: var(--font-body);
  font-size: 11pt;
  line-height: 1.6;
  color: var(--gray-700);
  background: white;
  margin: 0;
  padding: 0;
}

/* ========================================
   Header
   ======================================== */

.document-header {
  position: relative;
  margin-bottom: 40pt;
  padding-bottom: 20pt;
}

.logo-container {
  position: absolute;
  top: 0;
  right: 0;
  width: 51pt; /* 18mm */
  height: 51pt;
}

.brand-logo {
  width: 100%;
  height: 100%;
  opacity: 0.8;
  object-fit: contain;
}

.project-name {
  font-family: var(--font-display);
  font-size: 28pt;
  font-weight: 700;
  color: var(--primary-900);
  margin: 0 0 8pt 0;
  line-height: 1.2;
  max-width: 70%; /* Leave space for logo */
}

.project-metadata {
  display: flex;
  align-items: center;
  gap: 12pt;
  flex-wrap: wrap;
  margin-bottom: 16pt;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4pt;
  padding: 4pt 10pt;
  border-radius: 12pt;
  font-size: 9pt;
  font-weight: 500;
  text-transform: capitalize;
}

.status-dot {
  display: inline-block;
  width: 6pt;
  height: 6pt;
  border-radius: 50%;
}

/* Status colors */
.status-active {
  background-color: #d1fae5;
  color: #065f46;
}
.status-active .status-dot {
  background-color: #10b981;
}

.status-paused {
  background-color: #fef3c7;
  color: #92400e;
}
.status-paused .status-dot {
  background-color: #f59e0b;
}

.status-completed {
  background-color: var(--primary-100);
  color: var(--primary-800);
}
.status-completed .status-dot {
  background-color: var(--primary-500);
}

.metadata-item {
  font-size: 9pt;
  color: var(--gray-500);
}

.header-divider {
  border: none;
  border-top: 1px solid var(--gray-200);
  margin: 0;
}

/* ========================================
   Main Content
   ======================================== */

.document-content {
  margin: 0;
  padding: 0;
}

.prose {
  max-width: 100%;
}

/* Headings */
.prose h1 {
  font-family: var(--font-display);
  font-size: 24pt;
  font-weight: 600;
  color: var(--primary-800);
  line-height: 1.3;
  margin: 32pt 0 12pt 0;
  page-break-after: avoid;
}

.prose h2 {
  font-family: var(--font-display);
  font-size: 20pt;
  font-weight: 600;
  color: var(--primary-600);
  line-height: 1.3;
  margin: 24pt 0 10pt 0;
  page-break-after: avoid;
}

.prose h3 {
  font-family: var(--font-display);
  font-size: 16pt;
  font-weight: 500;
  color: var(--primary-500);
  line-height: 1.4;
  margin: 20pt 0 8pt 0;
  page-break-after: avoid;
}

.prose h4 {
  font-size: 13pt;
  font-weight: 600;
  color: var(--gray-900);
  line-height: 1.4;
  margin: 16pt 0 6pt 0;
  page-break-after: avoid;
}

/* Paragraphs */
.prose p {
  margin: 0 0 12pt 0;
  orphans: 3;
  widows: 3;
}

/* Lists */
.prose ul,
.prose ol {
  margin: 12pt 0;
  padding-left: 20pt;
}

.prose li {
  margin: 4pt 0;
  line-height: 1.6;
}

.prose ul ul,
.prose ol ol,
.prose ul ol,
.prose ol ul {
  margin: 4pt 0;
}

/* Links */
.prose a {
  color: var(--primary-600);
  text-decoration: none;
  font-weight: 500;
}

.prose a::after {
  content: " (" attr(href) ")";
  font-size: 8pt;
  color: var(--gray-500);
  font-weight: 400;
}

/* Emphasis */
.prose strong {
  font-weight: 600;
  color: var(--gray-900);
}

.prose em {
  font-style: italic;
  color: var(--gray-700);
}

/* Code */
.prose code {
  font-family: var(--font-mono);
  font-size: 9.5pt;
  background-color: var(--gray-100);
  padding: 2pt 4pt;
  border-radius: 3pt;
  color: var(--gray-800);
}

.prose pre {
  background-color: var(--gray-100);
  border-radius: 6pt;
  padding: 12pt;
  margin: 16pt 0;
  overflow-x: auto;
  page-break-inside: avoid;
}

.prose pre code {
  background-color: transparent;
  padding: 0;
  font-size: 9pt;
  line-height: 1.5;
}

/* Blockquotes */
.prose blockquote {
  border-left: 3pt solid var(--primary-500);
  padding-left: 16pt;
  margin: 16pt 0;
  font-style: italic;
  color: var(--gray-700);
  page-break-inside: avoid;
}

/* Tables */
.prose table {
  width: 100%;
  border-collapse: collapse;
  margin: 16pt 0;
  font-size: 10pt;
  page-break-inside: avoid;
}

.prose thead {
  background-color: var(--gray-50);
}

.prose th {
  font-weight: 600;
  text-align: left;
  padding: 8pt 10pt;
  border-bottom: 2pt solid var(--gray-200);
  color: var(--gray-900);
}

.prose td {
  padding: 8pt 10pt;
  border-bottom: 1pt solid var(--gray-200);
}

.prose tr:last-child td {
  border-bottom: none;
}

/* Horizontal Rules */
.prose hr {
  border: none;
  border-top: 1pt solid var(--gray-200);
  margin: 24pt 0;
}

/* ========================================
   Footer
   ======================================== */

.document-footer {
  display: none; /* Footer handled by @page rule */
}

/* ========================================
   Print Optimizations
   ======================================== */

/* Avoid page breaks in these elements */
.prose h1,
.prose h2,
.prose h3,
.prose h4,
.prose h5,
.prose h6 {
  page-break-after: avoid;
}

.prose pre,
.prose blockquote,
.prose table {
  page-break-inside: avoid;
}

/* Ensure consistent rendering */
img {
  max-width: 100%;
  height: auto;
  page-break-inside: avoid;
}

/* Remove orphans and widows */
p,
li,
td {
  orphans: 3;
  widows: 3;
}
```

### 5.5 API Endpoint: `/api/projects/[id]/export/pdf/+server.ts`

```typescript
/**
 * PDF Export API Endpoint
 * GET /api/projects/:id/export/pdf
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { ProjectExportService } from "$lib/services/export/project-export.service";

const exportService = new ProjectExportService();

export const GET: RequestHandler = async ({ params, locals }) => {
  try {
    // 1. Verify user authentication
    const session = await locals.getSession();
    if (!session?.user) {
      throw error(401, "Unauthorized");
    }

    const projectId = params.id;
    const userId = session.user.id;

    // 2. Generate PDF
    const pdfBuffer = await exportService.exportToPDF(projectId, userId);

    // 3. Return PDF with appropriate headers
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${getFilename(projectId)}.pdf"`,
        "Cache-Control": "no-cache",
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("PDF export error:", err);

    if (err.status === 401 || err.status === 403) {
      throw err;
    }

    if (err.message.includes("not found")) {
      throw error(404, "Project not found");
    }

    throw error(500, "Failed to generate PDF export");
  }
};

function getFilename(projectId: string): string {
  const timestamp = new Date().toISOString().split("T")[0];
  return `buildos-project-${projectId}-context-${timestamp}`;
}
```

### 5.6 UI Update: `ProjectContextDocModal.svelte`

```svelte
<!-- Add export button to modal header -->
<script lang="ts">
  // ... existing imports ...
  import { FileDown, FileText, Loader2 } from 'lucide-svelte';

  // ... existing code ...

  let exportingPDF = false;
  let exportError: string | null = null;

  async function handleExportPDF() {
    exportingPDF = true;
    exportError = null;

    try {
      const response = await fetch(`/api/projects/${project.id}/export/pdf`);

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Download PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.slug || project.id}-context.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toastService.success('PDF exported successfully');

    } catch (error) {
      console.error('Export error:', error);
      exportError = 'Failed to export PDF. Please try again.';
      toastService.error(exportError);
    } finally {
      exportingPDF = false;
    }
  }

  async function handlePreviewHTML() {
    window.open(`/api/projects/${project.id}/export/preview`, '_blank');
  }
</script>

<!-- In the modal header, add export button next to copy button -->
<div class="flex items-center space-x-2">
  <!-- Existing copy button -->
  <Button
    type="button"
    on:click={copyFullContext}
    disabled={copySuccess}
    variant={copySuccess ? 'primary' : 'outline'}
    size="sm"
  >
    <Copy class="w-3 h-3 mr-1.5" />
    <span class="hidden sm:inline">{copyButtonText}</span>
    <span class="sm:hidden">Copy</span>
  </Button>

  <!-- NEW: Export button with dropdown -->
  <div class="relative">
    <Button
      type="button"
      on:click={handleExportPDF}
      disabled={exportingPDF}
      variant="primary"
      size="sm"
    >
      {#if exportingPDF}
        <Loader2 class="w-3 h-3 mr-1.5 animate-spin" />
        Generating...
      {:else}
        <FileDown class="w-3 h-3 mr-1.5" />
        Export PDF
      {/if}
    </Button>
  </div>
</div>
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

**Service Layer Tests** (`project-export.service.test.ts`):

```typescript
describe("ProjectExportService", () => {
  describe("exportToPDF", () => {
    it("should generate PDF for valid project", async () => {
      // Test implementation
    });

    it("should throw error for unauthorized user", async () => {
      // Test implementation
    });

    it("should handle missing project context gracefully", async () => {
      // Test implementation
    });
  });
});
```

**PDF Generator Tests** (`pdf-generator.test.ts`):

```typescript
describe("PDFGenerator", () => {
  describe("generatePDF", () => {
    it("should generate valid PDF from HTML", async () => {
      // Test implementation with mock WeasyPrint
    });

    it("should respect timeout option", async () => {
      // Test implementation
    });

    it("should clean up temp files on error", async () => {
      // Test implementation
    });
  });
});
```

### 6.2 Integration Tests

**API Endpoint Tests**:

- Test authenticated requests
- Test unauthorized requests
- Test missing project ID
- Test PDF download headers
- Test error responses

### 6.3 Visual Regression Tests

**PDF Layout Tests**:

- Generate PDFs from sample projects
- Compare with baseline PDFs
- Verify typography, spacing, logo placement
- Test multi-page documents

### 6.4 Manual Testing Checklist

- [ ] PDF generated successfully
- [ ] Logo appears in top right corner
- [ ] Project name and dates display correctly
- [ ] Markdown formatting preserved
- [ ] Page breaks occur at appropriate places
- [ ] Footer page numbers correct
- [ ] Print quality is high (test on physical printer)
- [ ] File downloads with correct filename
- [ ] Error states display properly
- [ ] Loading states show during generation
- [ ] HTML preview opens in new tab
- [ ] Cross-browser compatibility (Chrome, Firefox, Safari)

---

## 7. Deployment Considerations

### 7.1 Server Requirements

**Dependencies**:

```bash
# Pandoc (universal document converter)
# Install via package manager
apt-get install pandoc  # Ubuntu/Debian
brew install pandoc     # macOS

# WeasyPrint (HTML/CSS to PDF)
# Install via pip
pip3 install weasyprint
```

**Vercel Configuration** (`vercel.json`):

```json
{
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/node"
    }
  ],
  "functions": {
    "api/projects/[id]/export/pdf.ts": {
      "memory": 1024,
      "maxDuration": 30
    }
  }
}
```

**Environment Variables**:

```env
# Optional: Path to Pandoc binary (if not in PATH)
PANDOC_PATH=/usr/local/bin/pandoc

# Optional: Path to WeasyPrint (if not in PATH)
WEASYPRINT_PATH=/usr/local/bin/weasyprint

# Feature flag
ENABLE_PDF_EXPORT=true
```

### 7.2 Performance Considerations

**Expected Generation Times**:

- Small document (<5 pages): 1-2 seconds
- Medium document (5-20 pages): 2-5 seconds
- Large document (20+ pages): 5-10 seconds

**Optimization Strategies**:

1. **Caching**: Cache generated PDFs for unchanged context documents
2. **Async Processing**: Consider background job queue for large documents
3. **CDN**: Serve static assets (logo, CSS) from CDN
4. **Compression**: Compress PDFs if file size exceeds threshold

**Resource Limits**:

- Max file size: 10 MB
- Timeout: 30 seconds
- Rate limiting: 10 exports per minute per user

### 7.3 Monitoring & Logging

**Metrics to Track**:

- Export success rate
- Average generation time
- Error rates by type
- User adoption rate
- File sizes

**Logging Strategy**:

```typescript
// Log export events
logger.info("PDF export started", {
  projectId,
  userId,
  contextLength: project.context.length,
});

logger.info("PDF export completed", {
  projectId,
  userId,
  generationTimeMs,
  fileSizeBytes,
});

logger.error("PDF export failed", {
  projectId,
  userId,
  error: error.message,
  stack: error.stack,
});
```

---

## 8. Future Enhancements

### 8.1 Phase 2 Features (Post-Launch)

1. **Multiple Themes**
   - Classic (current design)
   - Modern (gradient accents)
   - Minimal (ultra-clean)
   - Dark mode variant

2. **Customization Options**
   - Choose font family
   - Adjust font sizes
   - Toggle logo visibility
   - Custom brand colors

3. **Advanced Layouts**
   - Two-column layout option
   - Landscape orientation
   - Executive summary page
   - Table of contents generation

4. **Additional Formats**
   - DOCX export (editable)
   - Markdown export (raw)
   - Plain text export

5. **Batch Operations**
   - Export all projects at once
   - Zip archive download
   - Email PDF to stakeholders

6. **Collaborative Features**
   - Share PDF link (time-limited)
   - Comments/annotations
   - Version comparison

### 8.2 Technical Improvements

1. **Performance**
   - Implement Redis caching layer
   - Background job processing
   - PDF streaming for large documents

2. **Quality**
   - SVG logo support
   - Syntax highlighting for code blocks
   - Image optimization in context

3. **Accessibility**
   - Tagged PDF support
   - Screen reader compatibility
   - WCAG compliance

---

## 9. Success Metrics

### 9.1 Launch Criteria

- [ ] 95% export success rate
- [ ] <5 second average generation time
- [ ] Zero security vulnerabilities
- [ ] Cross-browser compatibility verified
- [ ] Print quality approved by design team
- [ ] User documentation complete

### 9.2 Post-Launch KPIs

**Adoption Metrics**:

- % of users who export at least 1 PDF (target: 30% within 1 month)
- Average exports per active user (target: 2-3 per month)

**Quality Metrics**:

- Export error rate (target: <2%)
- Average generation time (target: <5 seconds)
- User satisfaction rating (target: 4.5+/5)

**Business Impact**:

- Increased premium conversions (if feature is paywalled)
- Reduced support tickets about "how to share context"
- Higher project completion rates

---

## 10. Risks & Mitigation

### 10.1 Technical Risks

| Risk                               | Impact | Probability | Mitigation                                                  |
| ---------------------------------- | ------ | ----------- | ----------------------------------------------------------- |
| WeasyPrint not available on Vercel | High   | Medium      | Provide HTML-only fallback, explore serverless alternatives |
| PDF generation timeout             | Medium | Low         | Implement background jobs for large documents               |
| Poor PDF quality                   | High   | Low         | Extensive visual testing, design review process             |
| Large file sizes                   | Low    | Medium      | Implement PDF compression, warn users                       |
| Cross-browser compatibility        | Medium | Low         | Thorough testing, polyfills where needed                    |

### 10.2 UX Risks

| Risk                                 | Impact | Probability | Mitigation                                 |
| ------------------------------------ | ------ | ----------- | ------------------------------------------ |
| Users expect instant generation      | Medium | High        | Show clear loading state, set expectations |
| Confusion about export vs copy       | Low    | Medium      | Clear labeling, tooltips, help docs        |
| Print output doesn't match preview   | High   | Low         | Provide HTML preview option                |
| Users want customization immediately | Low    | High        | Communicate roadmap, gather feedback       |

### 10.3 Business Risks

| Risk                                | Impact | Probability | Mitigation                                |
| ----------------------------------- | ------ | ----------- | ----------------------------------------- |
| Low adoption rate                   | Medium | Medium      | Marketing, user education, in-app prompts |
| Server costs increase               | Low    | Medium      | Monitor usage, implement caching          |
| Competitor releases similar feature | Low    | Low         | Focus on quality and integration          |

---

## 11. Appendix

### 11.1 Alternative Approaches Considered

**Approach 1: Client-Side PDF Generation (jsPDF + html2canvas)**

- **Pros**: No server dependency, instant generation
- **Cons**: Poor typography, quality issues, browser limitations
- **Verdict**: Rejected due to quality concerns

**Approach 2: LaTeX-based Generation (Pandoc + XeLaTeX)**

- **Pros**: Excellent typesetting, professional quality
- **Cons**: Steep learning curve, complex templates, slower generation
- **Verdict**: Considered for future premium tier

**Approach 3: Commercial PDF Service (DocRaptor, PDFShift)**

- **Pros**: High quality, managed service, reliable
- **Cons**: Recurring costs, vendor lock-in
- **Verdict**: Backup option if self-hosted fails

### 11.2 Design Inspiration Sources

- Apple Product Requirement Documents
- Apple Human Interface Guidelines
- Stripe API Documentation
- Linear Product Specifications
- Notion Export Templates
- Google Material Design Print Guidelines

### 11.3 References

**Technical Documentation**:

- [Pandoc User's Guide](https://pandoc.org/MANUAL.html)
- [WeasyPrint Documentation](https://weasyprint.readthedocs.io/)
- [CSS Paged Media Module](https://www.w3.org/TR/css-page-3/)
- [Tailwind Typography Plugin](https://tailwindcss.com/docs/typography-plugin)

**Design Resources**:

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [SF Pro Font Family](https://developer.apple.com/fonts/)
- [Material Design Print Guidelines](https://material.io/design/communication/data-formats.html)

### 11.4 Glossary

- **Pandoc**: Universal document converter (Markdown → HTML/PDF/DOCX)
- **WeasyPrint**: HTML/CSS to PDF converter
- **Paged Media**: CSS module for print-specific styling
- **RLS**: Row Level Security (Supabase database security)
- **SvelteKit**: Full-stack framework for building web applications
- **SF Pro**: Apple's system font family

---

## 12. Sign-Off

**Document Status**: Draft
**Last Updated**: 2025-10-14
**Author**: Claude Code
**Reviewers**: [To be assigned]

**Approval Required From**:

- [ ] Product Manager (feature scope)
- [ ] Design Lead (visual design)
- [ ] Tech Lead (architecture)
- [ ] DevOps (deployment feasibility)

---

**Next Steps**:

1. Review and approve this specification
2. Create implementation tasks in project tracker
3. Assign developers and designers
4. Set up development environment
5. Begin Phase 1 implementation

---

_End of Specification_
