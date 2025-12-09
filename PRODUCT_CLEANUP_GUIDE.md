# Product Cleanup & Category Sync Guide

## Overview

This guide documents the improvements made to:
1. Product descriptions (cleanup and normalization)
2. Product counts (accurate counts matching visible products)
3. Category synchronization (real categories from database)
4. UX improvements (better category pages, empty state handling)

## What Was Changed

### 1. ✅ Product Description Cleanup Script (`scripts/cleanup-product-descriptions.ts`)

**Features:**
- Removes HTML tags and inline styles
- Decodes HTML entities (`&nbsp;`, `&amp;`, etc.)
- Removes redundant filler text (lorem ipsum, placeholder text)
- Normalizes whitespace and formatting
- Fixes common typos (duplicate words)
- Truncates short descriptions to max 200 characters
- Logs all changes for review

**Usage:**
```bash
# Test first (dry run)
npm run cleanup:descriptions:dry-run

# Apply changes
npm run cleanup:descriptions
```

### 2. ✅ Product Count Utilities (`lib/utils/product-count.ts`)

**New Functions:**
- `getProductCount(filters)` - Count products with same filters as listing
- `getCategoryCounts()` - Get product count per category
- `getCategoriesWithCounts()` - Get all categories with their counts
- `getTotalProductCount()` - Get total active products

**Benefits:**
- Consistent counting logic across the site
- Counts always match what users can see
- Only counts active products (`isActive: true`)
- Respects category, search, and price filters

### 3. ✅ Homepage Category Fixes (`app/page.tsx`)

**Before:**
- Hard-coded categories with fake counts (1250, 890, etc.)
- Categories didn't match database

**After:**
- Real categories from database
- Accurate product counts per category
- Shows top 6 categories by product count
- Handles empty categories gracefully

### 4. ✅ Products Page Improvements (`app/products/page.tsx`)

**Enhancements:**
- Shows category name as page title when filtering
- Displays product count for current category
- Better empty state messages
- Clear navigation back to all products

### 5. ✅ Search Placeholder Fix (`components/Header.tsx`)

**Before:** "Søk blant tusenvis av produkter..."
**After:** "Søk blant produkter..."

Removed misleading "tusenvis" (thousands) claim.

## How to Use

### Clean Up Product Descriptions

1. **Test first:**
   ```bash
   npm run cleanup:descriptions:dry-run
   ```

2. **Review the output:**
   - Check which descriptions will be updated
   - Verify the changes look correct
   - Note any descriptions that will be removed

3. **Apply changes:**
   ```bash
   npm run cleanup:descriptions
   ```

### Verify Category Counts

The homepage now automatically shows:
- Real categories from your database
- Accurate product counts
- Top 6 categories sorted by product count

To verify:
1. Check homepage - categories should match your actual products
2. Click a category - count should match products shown
3. Check products page - total should match grid

## Category Structure

**Current Setup:**
- Categories stored as strings in `Product.category` field
- No separate Category model
- Categories are extracted from products dynamically

**Category Pages:**
- URL: `/products?category=CategoryName`
- Shows all active products in that category
- Displays accurate count
- Handles empty categories with helpful message

## Product Description Standards

**After cleanup, descriptions should:**
- Be free of HTML tags
- Have normalized whitespace
- Be clear and concise
- Not contain filler text
- Preserve product-specific details (brand, model, specs)

**Short descriptions:**
- Max 200 characters
- Used for previews and meta descriptions
- Should be a concise summary

## Troubleshooting

### Categories Not Showing on Homepage

**Check:**
1. Do you have products with `category` field set?
2. Are products marked as `isActive: true`?
3. Check browser console for errors

**Fix:**
- Ensure products have category assigned
- Run: `npm run cleanup:descriptions` to clean data

### Product Counts Don't Match

**Check:**
1. Are you filtering by category/search?
2. Are inactive products being counted?

**Fix:**
- Counts now use `isActive: true` filter
- Counts respect category/search filters
- Should match exactly what users see

### Description Cleanup Removed Important Info

**If cleanup removed important content:**
1. Check the dry-run output first
2. Review what was removed
3. Manually restore if needed
4. The script is conservative - only removes obvious filler

## Files Modified

1. `scripts/cleanup-product-descriptions.ts` - New cleanup script
2. `lib/utils/product-count.ts` - New utility functions
3. `app/page.tsx` - Fixed category counts and sync
4. `app/products/page.tsx` - Improved category page UX
5. `components/Header.tsx` - Fixed search placeholder
6. `package.json` - Added cleanup scripts

## Next Steps (Optional)

### Further Improvements:

1. **Category Images:**
   - Replace placeholder images with real category images
   - Update `categoryImageMap` in `app/page.tsx`

2. **Category Management:**
   - Consider creating a Category model if needed
   - Add category descriptions
   - Add category slugs for better URLs

3. **Product Descriptions:**
   - Review cleaned descriptions manually
   - Add missing descriptions for products
   - Improve descriptions with better copy

4. **Analytics:**
   - Track which categories are most popular
   - Monitor product count accuracy
   - Log description cleanup stats

## Questions?

If you encounter issues:
1. Check the script output for detailed logs
2. Review database directly if needed
3. Verify product `isActive` status
4. Check category field values

