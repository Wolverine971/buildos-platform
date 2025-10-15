# Project Context Export - Manual Testing Guide

## Overview

This guide provides step-by-step instructions for testing the Project Context Export feature in the BuildOS web app.

**Feature**: Export project context documents as elegantly formatted PDFs with BuildOS branding

**Implementation Date**: 2025-10-14

**Specification**: `/thoughts/shared/research/2025-10-14_project-context-pretty-print-spec.md`

## Prerequisites

- ✅ WeasyPrint installed (`pip3 install weasyprint`)
- ✅ Dev server running (`pnpm dev:fast`)
- ✅ BuildOS account with at least one project containing context

## Automated Tests

Run the automated integration test first:

```bash
cd apps/web
./scripts/test-export-integration.sh
```

This verifies:

- WeasyPrint availability
- Template files exist
- Service files exist
- API endpoints exist
- PDF generation works with sample data

## Manual Testing Checklist

### 1. UI Integration Test

**Location**: Project Context Document Modal

**Steps**:

1. ✅ Start dev server: `pnpm dev:fast`
2. ✅ Navigate to http://localhost:5174
3. ✅ Sign in to your account
4. ✅ Go to a project with context (or create one)
5. ✅ Open the "Project Context Document" modal
6. ✅ Verify "Export PDF" button appears next to "Copy Document" button
7. ✅ Click "Export PDF" button

**Expected Results**:

- Button shows loading state: "Generating..." with spinner icon
- Toast notification appears: "PDF exported successfully"
- PDF file downloads automatically
- Filename format: `buildos-{slug}-context-{date}.pdf`

**Common Issues**:

- ❌ "PDF generation failed" → Check WeasyPrint installation
- ❌ "Project not found" → Verify project has context
- ❌ 401 Unauthorized → Sign in required

### 2. PDF Quality Test

**After downloading the PDF, verify**:

#### Visual Design

- ✅ BuildOS brain-bolt logo in top right corner (subtle, 120x120)
- ✅ BuildOS primary blue colors (#3b82f6, #2563eb)
- ✅ Clean typography with SF Pro fonts
- ✅ Generous white space (Apple PRD style)
- ✅ Professional, minimalist aesthetic

#### Content Structure

- ✅ Project name as main header (28pt, bold)
- ✅ Project metadata (status badge, dates)
- ✅ Status badge with colored dot indicator
- ✅ Context content rendered from markdown
- ✅ Proper heading hierarchy (H1: 24pt, H2: 20pt, H3: 16pt)
- ✅ Body text at 11pt with 1.6 line height

#### Print Quality

- ✅ A4 page size (210mm × 297mm)
- ✅ Proper margins (25mm left, 20mm right/top/bottom)
- ✅ Page numbers in footer (centered, small, gray)
- ✅ No content cutoff or overflow
- ✅ Code blocks formatted with monospace font
- ✅ Lists properly indented

#### Markdown Rendering

- ✅ Headings (H1, H2, H3, H4) render correctly
- ✅ Bold and italic text
- ✅ Links (colored, underlined)
- ✅ Code blocks with background
- ✅ Inline code with monospace
- ✅ Blockquotes with left border
- ✅ Bullet and numbered lists
- ✅ Tables (if present)

### 3. HTML Preview Test

**Steps**:

1. ✅ While in Project Context Document modal
2. ✅ Open browser dev tools (optional)
3. ✅ Manually navigate to: `http://localhost:5174/api/projects/{PROJECT_ID}/export/preview`
    - Replace `{PROJECT_ID}` with actual project UUID
4. ✅ Verify HTML preview loads in browser

**Expected Results**:

- HTML page renders with inline CSS
- Same visual design as PDF
- Content matches project context
- All markdown properly rendered

**Alternative Test**:

- Modify `ProjectContextDocModal.svelte` to add HTML preview button
- Click button to open preview in new tab

### 4. API Endpoint Tests

#### PDF Endpoint

**Request**:

```bash
curl -X GET \
  http://localhost:5174/api/projects/{PROJECT_ID}/export/pdf \
  -H "Cookie: {AUTH_COOKIE}" \
  --output test-export.pdf
```

**Expected Response**:

- Status: 200 OK
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="buildos-{slug}-context-{date}.pdf"`
- Content-Length: File size in bytes
- X-Generation-Time: Generation time in milliseconds
- Body: Binary PDF data

**Error Cases**:

- 401 Unauthorized → Not signed in
- 404 Not Found → Project doesn't exist or no access
- 500 Internal Error → PDF generation failed
- 503 Service Unavailable → WeasyPrint not available

#### HTML Preview Endpoint

**Request**:

```bash
curl -X GET \
  http://localhost:5174/api/projects/{PROJECT_ID}/export/preview \
  -H "Cookie: {AUTH_COOKIE}" \
  --output test-preview.html
```

**Expected Response**:

- Status: 200 OK
- Content-Type: `text/html; charset=utf-8`
- Cache-Control: `private, no-cache`
- Body: HTML with inline CSS

### 5. Edge Cases

Test the following scenarios:

#### Empty Context

- ✅ Project with no context (`context = null` or `context = ""`)
- Expected: PDF generates with placeholder text or empty content section

#### Large Context

- ✅ Project with very long context (10,000+ words)
- Expected: PDF generates with multiple pages, proper pagination

#### Special Characters

- ✅ Context with special markdown characters (`, \*, #, etc.)
- Expected: Characters render correctly, not breaking layout

#### Complex Markdown

- ✅ Context with nested lists, tables, code blocks
- Expected: All elements render correctly with proper styling

#### No Dates

- ✅ Project with `start_date = null` and `end_date = null`
- Expected: PDF generates without date fields

#### Long Project Name

- ✅ Project with very long name (50+ characters)
- Expected: Name wraps properly, doesn't overflow

### 6. Performance Test

**Metrics to measure**:

1. **Generation Time**
    - Check `X-Generation-Time` response header
    - Expected: < 5 seconds for typical context (1000-2000 words)
    - Warning: > 10 seconds may indicate performance issue

2. **File Size**
    - Check `Content-Length` response header
    - Expected: 50-200 KB for typical context
    - Warning: > 1 MB may indicate optimization issue

3. **Loading State**
    - Button should show loading state immediately
    - No UI freeze or blocking

### 7. Cross-Browser Testing

Test in multiple browsers:

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (macOS)

**Download behavior should work consistently**

### 8. Mobile Responsive Test

Test on mobile viewport:

- ✅ Export PDF button visible and clickable
- ✅ Button text adapts ("PDF" on mobile, "Export PDF" on desktop)
- ✅ Loading state works on mobile
- ✅ Download triggers correctly on mobile browsers

## Regression Testing

After any changes to:

- Template files (`context-doc.html`, `context-doc.css`)
- Service files (`*-service.ts`, `pdf-generator.ts`)
- API endpoints (`+server.ts`)

**Re-run**:

1. Automated integration test
2. UI integration test
3. PDF quality test

## Known Issues / Limitations

- WeasyPrint must be installed on server (not available in browser-only environments)
- PDF generation is synchronous (may timeout for very large contexts)
- Requires authentication (cannot generate PDFs for public projects without session)
- No custom theming options (single BuildOS theme only)

## Troubleshooting

### Issue: "WeasyPrint not found" error

**Solution**:

```bash
pip3 install weasyprint
# or
brew install weasyprint  # macOS
```

### Issue: PDF generation timeout

**Solution**:

- Increase timeout in `project-export.service.ts` (default: 60s)
- Check context size (may be too large)
- Check server resources (CPU/memory)

### Issue: Incorrect styling in PDF

**Solution**:

- Verify CSS file exists: `src/lib/templates/export/context-doc.css`
- Check CSS path in service
- Regenerate PDF after CSS changes

### Issue: Logo not appearing

**Solution**:

- Verify logo exists: `src/lib/templates/export/assets/brain-bolt-export.png`
- Check file permissions
- Verify logo path in HTML template

### Issue: Download doesn't trigger

**Solution**:

- Check browser pop-up blocker settings
- Verify `Content-Disposition` header in response
- Check browser console for JavaScript errors

## Success Criteria

The feature is working correctly when:

1. ✅ Automated tests pass
2. ✅ PDF downloads successfully from UI
3. ✅ PDF visual design matches spec
4. ✅ All markdown renders correctly
5. ✅ No console errors
6. ✅ Generation time < 5 seconds
7. ✅ Works in all major browsers
8. ✅ Mobile UI works correctly

## Related Documentation

- **Feature Spec**: `/thoughts/shared/research/2025-10-14_project-context-pretty-print-spec.md`
- **Implementation**: Phase 1 and Phase 2 complete
- **Test Script**: `/scripts/test-export-integration.sh`
- **Templates**: `/src/lib/templates/export/`
- **Services**: `/src/lib/services/export/`
- **API Endpoints**: `/src/routes/api/projects/[id]/export/`

## Contact / Support

For issues or questions about this feature:

- Check the specification document first
- Review the implementation code
- Run automated tests to verify setup
- Check browser console for errors
