# apps/web/scripts/test-pdf-export.sh

# BuildOS PDF Export Test Script
# Tests the Pandoc + WeasyPrint pipeline with sample data

set -e  # Exit on error

echo "🚀 BuildOS PDF Export Test"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check dependencies
echo "📋 Checking dependencies..."

if ! command -v pandoc &> /dev/null; then
    echo -e "${RED}❌ Pandoc not found${NC}"
    echo "Please install: brew install pandoc"
    exit 1
fi
echo -e "${GREEN}✅ Pandoc installed${NC}"

# Check if WeasyPrint is available (either via command or Python module)
if command -v weasyprint &> /dev/null; then
    WEASYPRINT_CMD="weasyprint"
    echo -e "${GREEN}✅ WeasyPrint installed (command)${NC}"
elif python3 -m weasyprint --version &> /dev/null; then
    WEASYPRINT_CMD="python3 -m weasyprint"
    echo -e "${GREEN}✅ WeasyPrint installed (Python module)${NC}"
else
    echo -e "${RED}❌ WeasyPrint not found${NC}"
    echo "Please install: pip3 install weasyprint"
    exit 1
fi

echo ""
echo "🔨 Building test PDF..."

# Navigate to template directory
cd "$(dirname "$0")/../src/lib/templates/export"

# Generate PDF using WeasyPrint
$WEASYPRINT_CMD \
  test-export.html \
  test-output.pdf \
  --stylesheet context-doc.css \
  --media-type print

if [ -f "test-output.pdf" ]; then
    echo -e "${GREEN}✅ PDF generated successfully!${NC}"
    echo ""
    echo "📄 Output file: src/lib/templates/export/test-output.pdf"
    echo ""

    # Check file size
    FILE_SIZE=$(du -h test-output.pdf | cut -f1)
    echo "   File size: $FILE_SIZE"

    # Open the PDF (macOS)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo ""
        echo "🔍 Opening PDF..."
        open test-output.pdf
    fi

    echo ""
    echo -e "${GREEN}✨ Test completed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review the generated PDF"
    echo "  2. Verify typography, spacing, and layout"
    echo "  3. Check logo placement and opacity"
    echo "  4. Test print output if possible"
else
    echo -e "${RED}❌ PDF generation failed${NC}"
    exit 1
fi
