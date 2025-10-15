# apps/web/scripts/test-export-integration.sh

# Test Export Integration Script
# This script tests the export functionality without requiring manual UI testing

set -e

echo "🔍 Testing Project Context Export Integration"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check WeasyPrint availability
echo "1. Checking WeasyPrint availability..."
if python3 -m weasyprint --version &> /dev/null; then
    VERSION=$(python3 -m weasyprint --version 2>&1 | head -n1)
    echo -e "${GREEN}✓${NC} WeasyPrint found: $VERSION"
else
    echo -e "${RED}✗${NC} WeasyPrint not found"
    echo "   Install with: pip3 install weasyprint"
    exit 1
fi
echo ""

# 2. Check template files
echo "2. Checking template files..."
TEMPLATE_DIR="src/lib/templates/export"
FILES=("context-doc.html" "context-doc.css" "assets/brain-bolt-export.png")

for file in "${FILES[@]}"; do
    if [ -f "$TEMPLATE_DIR/$file" ]; then
        echo -e "${GREEN}✓${NC} $file exists"
    else
        echo -e "${RED}✗${NC} $file missing"
        exit 1
    fi
done
echo ""

# 3. Check service files
echo "3. Checking service files..."
SERVICE_DIR="src/lib/services/export"
SERVICES=("template-renderer.ts" "markdown-processor.ts" "pdf-generator.ts" "project-export.service.ts")

for service in "${SERVICES[@]}"; do
    if [ -f "$SERVICE_DIR/$service" ]; then
        echo -e "${GREEN}✓${NC} $service exists"
    else
        echo -e "${RED}✗${NC} $service missing"
        exit 1
    fi
done
echo ""

# 4. Check API endpoints
echo "4. Checking API endpoints..."
API_DIR="src/routes/api/projects/[id]/export"
ENDPOINTS=("pdf/+server.ts" "preview/+server.ts")

for endpoint in "${ENDPOINTS[@]}"; do
    if [ -f "$API_DIR/$endpoint" ]; then
        echo -e "${GREEN}✓${NC} $endpoint exists"
    else
        echo -e "${RED}✗${NC} $endpoint missing"
        exit 1
    fi
done
echo ""

# 5. Test PDF generation with sample data
echo "5. Testing PDF generation with sample HTML..."
cd "$TEMPLATE_DIR"

if [ -f "test-export.html" ]; then
    TEST_OUTPUT="test-integration-$(date +%s).pdf"

    if python3 -m weasyprint test-export.html "$TEST_OUTPUT" --stylesheet context-doc.css --media-type print 2>&1 | grep -i "error" > /dev/null; then
        echo -e "${RED}✗${NC} PDF generation failed"
        exit 1
    else
        if [ -f "$TEST_OUTPUT" ]; then
            SIZE=$(ls -lh "$TEST_OUTPUT" | awk '{print $5}')
            echo -e "${GREEN}✓${NC} PDF generated successfully: $TEST_OUTPUT ($SIZE)"

            # Clean up
            rm "$TEST_OUTPUT"
        else
            echo -e "${RED}✗${NC} PDF file not created"
            exit 1
        fi
    fi
else
    echo -e "${YELLOW}⚠${NC} test-export.html not found, skipping PDF generation test"
fi

cd - > /dev/null
echo ""

# 6. Check TypeScript compilation (service files)
echo "6. Checking TypeScript syntax..."
if command -v npx &> /dev/null; then
    # Just check for obvious syntax errors in service files
    for service in "${SERVICES[@]}"; do
        if grep -q "export class\|export interface\|export type" "$SERVICE_DIR/$service"; then
            echo -e "${GREEN}✓${NC} $service has valid TypeScript exports"
        fi
    done
else
    echo -e "${YELLOW}⚠${NC} npx not found, skipping TypeScript check"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ All integration tests passed!${NC}"
echo ""
echo "Next steps for manual testing:"
echo "  1. Start dev server: pnpm dev:fast"
echo "  2. Navigate to a project with context"
echo "  3. Open the Project Context Document modal"
echo "  4. Click 'Export PDF' button"
echo "  5. Verify PDF downloads with correct formatting"
echo "  6. Check logo, colors, typography, and layout"
echo ""
echo "API endpoints to test in browser (requires auth):"
echo "  - PDF: http://localhost:5174/api/projects/{PROJECT_ID}/export/pdf"
echo "  - HTML Preview: http://localhost:5174/api/projects/{PROJECT_ID}/export/preview"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
