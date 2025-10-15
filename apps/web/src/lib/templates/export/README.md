# BuildOS Project Context Export Templates

This directory contains templates and assets for generating elegant PDF exports of project context documents.

## 📁 Directory Structure

```
export/
├── context-doc.html       # Main HTML template
├── context-doc.css        # Stylesheet (Apple-inspired design)
├── test-export.html       # Sample document for testing
├── assets/
│   └── brain-bolt-export.png  # BuildOS logo (optimized for PDF)
└── README.md             # This file
```

## 🎨 Design Philosophy

The templates follow Apple's Human Interface Guidelines with:

- **SF Pro fonts** (Display for headings, Text for body)
- **BuildOS color palette** (primary blues, grays)
- **Generous white space** (60:40 content-to-space ratio)
- **Professional typography** (11pt body, clear hierarchy)
- **Subtle branding** (logo at 80% opacity, top right)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# From project root
cd apps/web
./scripts/setup-export-tools.sh
```

This installs:

- **Pandoc** - Universal document converter
- **WeasyPrint** - HTML/CSS to PDF renderer

### 2. Test the Pipeline

```bash
# Generate test PDF
./scripts/test-pdf-export.sh
```

This will:

- Generate a sample PDF from `test-export.html`
- Apply styling from `context-doc.css`
- Save output to `test-output.pdf`
- Open the PDF for review (macOS)

### 3. Manual Test (Optional)

```bash
cd src/lib/templates/export

# Generate PDF manually
weasyprint \
  test-export.html \
  output.pdf \
  --stylesheet context-doc.css \
  --media-type print \
  --page-size A4
```

## 📄 Template Usage

### HTML Template Structure

```html
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<title>{{projectName}} - Context Document</title>
	</head>
	<body>
		<header class="document-header">
			<div class="logo-container">
				<img src="{{logoPath}}" alt="BuildOS" class="brand-logo" />
			</div>
			<h1 class="project-name">{{projectName}}</h1>
			<div class="project-metadata">
				<!-- Status badge, dates -->
			</div>
			<hr class="header-divider" />
		</header>

		<main class="document-content">
			<article class="prose">
				{{{projectContext}}}
				<!-- Markdown rendered to HTML -->
			</article>
		</main>

		<footer class="document-footer">
			<!-- Page numbers via CSS @page rule -->
		</footer>
	</body>
</html>
```

### Template Variables

When implementing the service layer, replace these placeholders:

| Variable                 | Type   | Example                           |
| ------------------------ | ------ | --------------------------------- |
| `{{projectName}}`        | string | "BuildOS API Platform"            |
| `{{projectStatus}}`      | string | "active" / "paused" / "completed" |
| `{{projectStatusLabel}}` | string | "Active"                          |
| `{{projectStartDate}}`   | string | "Oct 14, 2025"                    |
| `{{projectEndDate}}`     | string | "Dec 31, 2025"                    |
| `{{projectContext}}`     | HTML   | Markdown converted to HTML        |
| `{{logoPath}}`           | path   | "assets/brain-bolt-export.png"    |
| `{{generatedDate}}`      | string | "Oct 14, 2025"                    |

### CSS Customization

The stylesheet uses CSS custom properties for easy theming:

```css
:root {
	/* BuildOS Colors */
	--primary-500: #3b82f6;
	--primary-600: #2563eb;
	--primary-900: #1e3a8a;

	--gray-700: #374151;
	--gray-900: #111827;

	/* Typography */
	--font-display: 'SF Pro Display', -apple-system, sans-serif;
	--font-body: 'SF Pro Text', -apple-system, sans-serif;
	--font-mono: 'SF Mono', Menlo, Monaco, monospace;
}
```

## 🎯 Design Specifications

### Page Layout

- **Page Size**: A4 (210mm × 297mm)
- **Margins**: 25mm top, 20mm right/bottom, 25mm left
- **Content Width**: ~165mm

### Typography Scale

| Element      | Size | Weight | Color       |
| ------------ | ---- | ------ | ----------- |
| Project Name | 28pt | 700    | primary-900 |
| H1           | 24pt | 600    | primary-800 |
| H2           | 20pt | 600    | primary-600 |
| H3           | 16pt | 500    | primary-500 |
| Body         | 11pt | 400    | gray-700    |
| Metadata     | 9pt  | 400    | gray-500    |

### Logo Specifications

- **Position**: Top right corner
- **Size**: 18mm × 18mm (51pt × 51pt)
- **Opacity**: 0.8
- **Source**: `assets/brain-bolt-export.png`

## 🧪 Testing Checklist

After making changes, verify:

- [ ] Logo appears correctly (top right, proper size)
- [ ] Typography hierarchy is clear
- [ ] Colors match BuildOS brand
- [ ] Page breaks occur at logical points
- [ ] Footer page numbers work
- [ ] Tables render properly
- [ ] Code blocks have correct styling
- [ ] Links show URLs in parentheses
- [ ] Blockquotes have left border
- [ ] Print quality is high-resolution

## 📝 Implementation Notes

### Phase 1 (Current)

✅ Template system created
✅ CSS stylesheet with BuildOS theme
✅ Logo asset optimized
✅ Test documents and scripts

### Phase 2 (Next)

- [ ] Service layer (`project-export.service.ts`)
- [ ] PDF Generator wrapper (`pdf-generator.ts`)
- [ ] Template renderer (`template-renderer.ts`)
- [ ] Markdown processor (`markdown-processor.ts`)

### Phase 3

- [ ] API endpoints
- [ ] Frontend integration
- [ ] Error handling
- [ ] Loading states

## 🔧 Troubleshooting

### "Pandoc not found"

```bash
# macOS
brew install pandoc

# Linux
sudo apt-get install pandoc
```

### "WeasyPrint not found"

```bash
# Install with pip
pip3 install weasyprint

# If not in PATH, add:
export PATH="$HOME/.local/bin:$PATH"
```

### "Cairo/Pango errors" (macOS)

```bash
# Install system dependencies
brew install cairo pango gdk-pixbuf libffi
```

### PDF looks different than expected

1. Check that CSS file is being applied
2. Verify logo path is correct
3. Test with `test-export.html` first
4. Review WeasyPrint output for warnings

## 📚 Resources

- [Pandoc User Guide](https://pandoc.org/MANUAL.html)
- [WeasyPrint Documentation](https://weasyprint.readthedocs.io/)
- [CSS Paged Media](https://www.w3.org/TR/css-page-3/)
- [Apple HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)

## 🤝 Contributing

When updating templates:

1. Make changes to `context-doc.html` or `context-doc.css`
2. Update `test-export.html` to reflect changes
3. Run `./scripts/test-pdf-export.sh`
4. Review generated PDF
5. Update this README if needed

---

**Last Updated**: 2025-10-14
**Status**: Phase 1 Complete ✅
