# migrate-docs.sh

echo "🚀 Starting comprehensive documentation migration..."

# Architecture docs migration
echo "📐 Migrating architecture documentation..."
[ -f docs/architecture/BUILD_OS_MASTER_CONTEXT.md ] && mv docs/architecture/BUILD_OS_MASTER_CONTEXT.md docs/technical/architecture/
[ -f docs/architecture/CALENDAR_SERVICE_FLOW.md ] && mv docs/architecture/CALENDAR_SERVICE_FLOW.md docs/technical/architecture/
[ -f docs/architecture/CALENDAR_WEBHOOK_FLOW.md ] && mv docs/architecture/CALENDAR_WEBHOOK_FLOW.md docs/technical/architecture/
[ -f docs/architecture/SCALABILITY_ANALYSIS.md ] && mv docs/architecture/SCALABILITY_ANALYSIS.md docs/technical/architecture/
[ -f docs/architecture/system-checkpoint.md ] && mv docs/architecture/system-checkpoint.md docs/technical/architecture/
[ -f docs/architecture/email-system.md ] && mv docs/architecture/email-system.md docs/technical/architecture/

# Move design docs to technical/components
echo "🎨 Migrating design documentation..."
mkdir -p docs/technical/components/brain-dump
mkdir -p docs/technical/components/projects
[ -f docs/design/BUILDOS_STYLE_GUIDE.md ] && cp docs/design/BUILDOS_STYLE_GUIDE.md docs/technical/components/
[ -f docs/design/DESIGN_SYSTEM_GUIDE.md ] && cp docs/design/DESIGN_SYSTEM_GUIDE.md docs/technical/components/
[ -f docs/design/components/MODAL_STANDARDS.md ] && cp docs/design/components/MODAL_STANDARDS.md docs/technical/components/

# Move brain dump related design docs
[ -f docs/design/BRAIN_DUMP_AUTO_ACCEPT_SIMPLE.md ] && mv docs/design/BRAIN_DUMP_AUTO_ACCEPT_SIMPLE.md docs/technical/components/brain-dump/
[ -f docs/design/BRAIN_DUMP_UNIFIED_STORE_ARCHITECTURE.md ] && mv docs/design/BRAIN_DUMP_UNIFIED_STORE_ARCHITECTURE.md docs/technical/components/brain-dump/
[ -f docs/design/SHORT_BRAINDUMP_QUESTION_GENERATION_FIX.md ] && mv docs/design/SHORT_BRAINDUMP_QUESTION_GENERATION_FIX.md docs/technical/components/brain-dump/

# Move project related design docs
[ -f docs/design/PROJECT_PAGE_COMPONENT_PATTERNS.md ] && mv docs/design/PROJECT_PAGE_COMPONENT_PATTERNS.md docs/technical/components/projects/
[ -f docs/design/GOOGLE_CALENDARS_FOR_PROJECTS.md ] && mv docs/design/GOOGLE_CALENDARS_FOR_PROJECTS.md docs/technical/components/projects/

# Move development docs
echo "⚙️ Migrating development documentation..."
[ -f docs/development/DEVELOPMENT_PROCESS.md ] && cp docs/development/DEVELOPMENT_PROCESS.md docs/technical/development/
[ -f docs/development/GIT_WORKFLOW.md ] && cp docs/development/GIT_WORKFLOW.md docs/technical/development/
[ -f docs/development/TESTING_CHECKLIST.md ] && cp docs/development/TESTING_CHECKLIST.md docs/technical/testing/

# Move deployment docs
echo "🚀 Migrating deployment documentation..."
mkdir -p docs/technical/deployment
[ -f docs/deployment/DEPLOYMENT_CHECKLIST.md ] && mv docs/deployment/DEPLOYMENT_CHECKLIST.md docs/technical/deployment/
[ -f docs/deployment/VERCEL_DEPLOYMENT.md ] && mv docs/deployment/VERCEL_DEPLOYMENT.md docs/technical/deployment/

# Move integration docs
echo "🔌 Migrating integration documentation..."
mkdir -p docs/technical/integrations
[ -f docs/integrations/stripe-setup.md ] && cp docs/integrations/stripe-setup.md docs/technical/integrations/
[ -f docs/integrations/stripe-integration-overview.md ] && cp docs/integrations/stripe-integration-overview.md docs/technical/integrations/
[ -f docs/integrations/STRIPE_IMPLEMENTATION_SUMMARY.md ] && cp docs/integrations/STRIPE_IMPLEMENTATION_SUMMARY.md docs/technical/integrations/

# Move audit docs
echo "📊 Migrating audit documentation..."
mkdir -p docs/technical/audits
[ -f docs/audits/BRAINDUMP_FLOW_AUDIT_2025.md ] && cp docs/audits/BRAINDUMP_FLOW_AUDIT_2025.md docs/technical/audits/

# Create user content from existing docs
echo "👤 Creating user guide content..."
[ -f docs/blogs/how-to-brain-dump-effectively.md ] && cp docs/blogs/how-to-brain-dump-effectively.md docs/user-guide/features/brain-dump.md

# Business docs are already in place
echo "💼 Business documentation already organized..."

# Move prompt architecture docs
echo "🤖 Organizing prompt documentation..."
[ -f docs/prompts/PROMPT_ARCHITECTURE.md ] && cp docs/prompts/PROMPT_ARCHITECTURE.md docs/prompts/architecture.md

echo "✅ Migration complete! Checking results..."

# Show what's been moved
echo ""
echo "📁 New Technical Documentation Structure:"
find docs/technical -type f -name "*.md" | wc -l
echo "files in /docs/technical/"

echo ""
echo "📁 Architecture docs migrated:"
ls docs/technical/architecture/*.md 2>/dev/null | wc -l
echo "files"

echo ""
echo "📁 Component docs migrated:"
find docs/technical/components -name "*.md" | wc -l
echo "files"

echo ""
echo "🎯 Migration Summary:"
echo "- Architecture docs → /docs/technical/architecture/"
echo "- Design docs → /docs/technical/components/"
echo "- Development docs → /docs/technical/development/"
echo "- Deployment docs → /docs/technical/deployment/"
echo "- Integration docs → /docs/technical/integrations/"
echo "- Audit docs → /docs/technical/audits/"

echo ""
echo "📝 Next steps:"
echo "1. Run brain dump consolidation"
echo "2. Generate API documentation"
echo "3. Create runbooks"
echo "4. Merge archive branch to remove old files"
echo "5. Update start-here.md with new paths"