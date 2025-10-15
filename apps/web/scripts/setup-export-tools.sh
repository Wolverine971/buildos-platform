# apps/web/scripts/setup-export-tools.sh

# BuildOS PDF Export Tools Setup Script
# Installs Pandoc and WeasyPrint for PDF generation

set -e  # Exit on error

echo "🔧 BuildOS PDF Export Tools Setup"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
fi

echo -e "${BLUE}Detected OS: $OS${NC}"
echo ""

# Install Pandoc
echo "📦 Installing Pandoc..."
if command -v pandoc &> /dev/null; then
    PANDOC_VERSION=$(pandoc --version | head -n 1)
    echo -e "${GREEN}✅ Pandoc already installed: $PANDOC_VERSION${NC}"
else
    if [[ "$OS" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            echo "   Installing via Homebrew..."
            brew install pandoc
            echo -e "${GREEN}✅ Pandoc installed successfully${NC}"
        else
            echo -e "${RED}❌ Homebrew not found. Please install from: https://brew.sh${NC}"
            echo "   Then run: brew install pandoc"
            exit 1
        fi
    elif [[ "$OS" == "linux" ]]; then
        echo "   Installing via apt-get..."
        sudo apt-get update
        sudo apt-get install -y pandoc
        echo -e "${GREEN}✅ Pandoc installed successfully${NC}"
    else
        echo -e "${RED}❌ Unsupported OS for automatic installation${NC}"
        echo "   Please install Pandoc manually: https://pandoc.org/installing.html"
        exit 1
    fi
fi

echo ""

# Install WeasyPrint
echo "📦 Installing WeasyPrint..."
if command -v weasyprint &> /dev/null; then
    WEASYPRINT_VERSION=$(weasyprint --version)
    echo -e "${GREEN}✅ WeasyPrint already installed: $WEASYPRINT_VERSION${NC}"
else
    # Check if Python 3 is installed
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}❌ Python 3 not found${NC}"
        echo "   Please install Python 3 first"
        exit 1
    fi

    PYTHON_VERSION=$(python3 --version)
    echo "   Using $PYTHON_VERSION"

    # Check if pip3 is installed
    if ! command -v pip3 &> /dev/null; then
        echo -e "${RED}❌ pip3 not found${NC}"
        echo "   Please install pip3 first"
        exit 1
    fi

    echo "   Installing via pip3..."

    # Install system dependencies for WeasyPrint (macOS)
    if [[ "$OS" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            echo "   Installing system dependencies..."
            brew install cairo pango gdk-pixbuf libffi
        else
            echo -e "${YELLOW}⚠️  Homebrew not found. You may need to install cairo, pango, gdk-pixbuf, and libffi manually${NC}"
        fi
    fi

    # Install WeasyPrint
    pip3 install weasyprint

    if command -v weasyprint &> /dev/null; then
        echo -e "${GREEN}✅ WeasyPrint installed successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  WeasyPrint may not be in PATH. Try:${NC}"
        echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
fi

echo ""
echo "=================================="
echo -e "${GREEN}✨ Setup Complete!${NC}"
echo ""
echo "Installed tools:"
echo "  • Pandoc:     $(pandoc --version | head -n 1 | awk '{print $2}')"
echo "  • WeasyPrint: $(weasyprint --version 2>&1 | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' | head -n 1 || echo 'installed')"
echo ""
echo "Next steps:"
echo "  1. Run test script: ./scripts/test-pdf-export.sh"
echo "  2. Review generated PDF in: src/lib/templates/export/test-output.pdf"
echo "  3. Proceed to Phase 2 implementation"
echo ""
