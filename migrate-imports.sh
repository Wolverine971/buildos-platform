# migrate-imports.sh

# Update imports in worker app
echo "Updating imports in worker app..."

# Replace database.types imports with shared-types
find apps/worker/src -name "*.ts" -type f -exec sed -i '' \
  "s|from '\./database\.types'|from '@buildos/shared-types'|g" {} \;

find apps/worker/src -name "*.ts" -type f -exec sed -i '' \
  "s|from '\.\.\/database\.types'|from '@buildos/shared-types'|g" {} \;

find apps/worker/src -name "*.ts" -type f -exec sed -i '' \
  "s|from '\.\.\/\.\.\/database\.types'|from '@buildos/shared-types'|g" {} \;

find apps/worker/src -name "*.ts" -type f -exec sed -i '' \
  "s|from '.*\/database\.types'|from '@buildos/shared-types'|g" {} \;

# Update imports in web app
echo "Updating imports in web app..."

# Replace database.schema imports with shared-types
find apps/web/src -name "*.ts" -name "*.svelte" -type f -exec sed -i '' \
  "s|from '\$lib\/database\.schema'|from '@buildos/shared-types'|g" {} \;

echo "Import migration complete!"