# Electrohype Color Variant Cleanup Guide

## Overview

This guide documents the cleanup process to ensure **only BLACK/SVART color variants** exist for all products in Electrohype.

## What Was Changed

### 1. ✅ Cleanup Script (`scripts/cleanup-color-variants.ts`)
- Analyzes all products and variants
- Identifies color from `attributes.color`, `attributes.farge`, or variant name
- Keeps only BLACK/SVART variants
- Soft-deletes (sets `isActive=false`) non-black variants by default
- Can hard-delete with `--hard-delete` flag
- Handles edge cases (products with only non-black colors, variants without color info)

### 2. ✅ Temu Scraper Updated (`lib/scrapers/temu-scraper.ts`)
- **Before**: Created multiple color variants (Svart, Hvit, Grå, Rød, Blå, etc.)
- **After**: Only creates BLACK/SVART variants
- Automatically normalizes any detected colors to "Svart"
- Default variant is now "Svart" instead of "Standard"

### 3. ✅ Validation Layer (`lib/validation/color-validation.ts`)
- New validation functions to ensure only black colors
- Used in all variant creation/update endpoints
- Throws clear error messages if non-black colors are attempted

### 4. ✅ API Endpoints Updated
- `POST /api/admin/products/[id]/variants` - Validates color on creation
- `PUT /api/admin/products/[id]/variants` - Validates all variants
- `PATCH /api/admin/products/[id]/variants/[variantId]` - Validates on update
- All endpoints reject non-black colors with clear error messages

## How to Use

### Step 1: Backup Your Data (IMPORTANT!)

Before running the cleanup, backup your database:

```bash
# SQLite backup (if using SQLite)
cp prisma/dev.db prisma/dev.db.backup

# Or export products via API/Prisma Studio
```

### Step 2: Run Dry-Run First

Test what will be changed without making any modifications:

```bash
npm run cleanup:colors:dry-run
```

This will:
- Show which products will be affected
- List variants that will be kept vs removed
- Identify products with only non-black colors (will be fixed)
- **No changes will be made to the database**

### Step 3: Review the Output

Check the dry-run output carefully:
- Verify the logic is correct
- Note any products that need manual review
- Check the summary statistics

### Step 4: Run the Actual Cleanup

Once you're satisfied with the dry-run:

```bash
# Soft delete (recommended - sets isActive=false)
npm run cleanup:colors

# OR hard delete (permanently removes variants)
npm run cleanup:colors -- --hard-delete
```

**Recommendation**: Use soft delete first. You can review deactivated variants later and manually delete them if needed.

### Step 5: Verify Results

After cleanup, verify:
1. Check a few products in admin panel
2. Ensure only black variants are active
3. Review deactivated variants if using soft delete

## What the Cleanup Does

### For Products with Black Variants:
- ✅ Keeps all black variants
- ❌ Removes/deactivates all non-black variants
- ✅ Keeps variants without color info (assumed to be size-only)

### For Products with Only Non-Black Variants:
- ⚠️ Keeps the first variant
- 🔧 Sets its color to "Svart" (black)
- ❌ Removes/deactivates all other variants

### For Products with Variants Without Color Info:
- ✅ Keeps all variants (assumed to be size-only, not color variants)

## Preventing Future Non-Black Colors

### Automatic Prevention:
1. **Temu Scraper**: Only creates black variants
2. **API Validation**: Rejects non-black colors with error messages
3. **Admin UI**: Should show validation errors if non-black colors are attempted

### Manual Prevention:
- When creating products manually, always use "Svart" or "Black" for color
- If importing from other sources, update those importers to normalize colors

## Color Validation Rules

Valid black color names (case-insensitive):
- `black`, `Black`, `BLACK`
- `svart`, `Svart`, `SVART`
- `sort`, `Sort`, `SORT`
- `#000000`, `#000`, `000000`, `000`

All other colors are rejected.

## Troubleshooting

### Error: "Electrohype policy: Only BLACK/SVART colors are allowed"
- **Cause**: Trying to create/update a variant with a non-black color
- **Solution**: Change the color to "Svart" or "Black"

### Products Still Show Multiple Colors After Cleanup
- Check if variants are deactivated (`isActive=false`) - they may still appear in some views
- Run cleanup again with `--hard-delete` to permanently remove them
- Check if there are variants without color info that are being kept

### Cleanup Script Fails
- Check database connection
- Ensure Prisma client is generated: `npm run db:generate`
- Check for database locks (close Prisma Studio if open)

## Files Modified

1. `scripts/cleanup-color-variants.ts` - New cleanup script
2. `lib/scrapers/temu-scraper.ts` - Updated to only create black variants
3. `lib/validation/color-validation.ts` - New validation functions
4. `app/api/admin/products/[id]/variants/route.ts` - Added validation
5. `app/api/admin/products/[id]/variants/[variantId]/route.ts` - Added validation
6. `package.json` - Added cleanup scripts

## Next Steps (Optional)

### Frontend Updates:
- Consider removing color filters from product listing (if they exist)
- Update product detail pages to not show color selection (only black available)
- Simplify variant selection UI

### Database Cleanup:
- After verifying soft-deleted variants, you can permanently delete them:
  ```sql
  DELETE FROM ProductVariant WHERE isActive = false;
  ```

## Questions?

If you encounter issues or have questions:
1. Check the script output for detailed logs
2. Review the validation error messages
3. Check database directly if needed

