# Product Title Improvement Guide

## Overview

This guide documents the product title improvement system that cleans up and standardizes product titles across the Electrohype store.

## Goals

- **Short, clear, professional titles** (3-8 words)
- **Remove unnecessary/repetitive words**
- **Remove technical specs** (belong in description)
- **Remove geographical references** (Vietnam/Kinesisk/Cherry kompatibel)
- **Remove model IDs** (G601099600944889)
- **Keep important attributes**: size, type, variant, switches, color

## Format Examples

### Before → After

**Keyboard:**
- ❌ "68 Mekanisk Spilltastatur Med Blå Brytere Kompatibelt Med Cherry Vietnam Kinesisk RGB Bakgrunnsbelyst Mini Pc Bærbar Tastatur Avtakbar Type C Kabel Tastaturkapseluttrekker Kabelt For Windows Blå Brytere Inkludert G601099600944889"
- ✅ "68-taster Mekanisk Tastatur (Blå brytere)"

**Cable:**
- ❌ "Superlang Hurtigladekabel Usb Datasynkroniseringskabel For Iphone 14 13 12 11 Pro Max Se X 8 7 6 Laderkabel For Ipad G 601099518830175"
- ✅ "USB Superlang Ladekabel"

**Charger:**
- ❌ "470 lader pd 140w usb type c 6 skrivebord - Temu Norway"
- ✅ "USB Lader 140W"

**Mouse:**
- ❌ "2 4ghz Ergonomisk Trådløs Spillmus Med Usb Mottaker Komfortabelt Design Strømlinjeformet Passform Rød Og Svart Alternativer For Gaming Kontor Og Underholdning Portabel Datamus Ergonomisk Mus Sleik Glatt Overflate G 601101562224534"
- ✅ "Trådløs Gaming Ergonomisk mus"

## Rules Applied

### 1. Removal Patterns
- Model IDs: `G\d{12,}` (e.g., G601099600944889)
- Geographical: Vietnam, Kinesisk, Cherry kompatibel
- Supplier names: Temu Norway, Alibaba, eBay
- Redundant phrases: "For bedrift", "Inkludert", "Kompatibel"
- Technical specs in title: RGB bakgrunnsbelyst (belongs in description)

### 2. Normalization Patterns
- Keyboard sizes: "68-taster", "60% tastatur"
- Common abbreviations: "USB-C", "Type-C", "HDMI"
- Switch types: "(Blå brytere)", "(Rød brytere)"
- Product types: "Gaming-tastatur", "Gaming-mus"

### 3. Product Type-Specific Rules

#### Keyboards
- Format: `[Size] [Type] Tastatur [Switches]`
- Examples:
  - "68-taster Mekanisk Tastatur (Blå brytere)"
  - "Trådløst Tastatur og Mus"
  - "Gaming RGB Tastatur"

#### Mice
- Format: `[Wireless] [Gaming] [Ergonomisk] mus`
- Examples:
  - "Trådløs Gaming mus"
  - "Ergonomisk mus"

#### Cables
- Format: `[Type] [Features] [Category] [Length] [Power]`
- Examples:
  - "USB-C til Lightning Ladekabel 30W"
  - "HDMI Flettet kabel"
  - "USB Superlang Ladekabel"

#### Chargers
- Format: `[Type] [Category] [Power] [Ports]`
- Examples:
  - "USB-C Hurtiglader 60W"
  - "Laderstativ 15W"
  - "USB Lader 140W"

## Usage

### Check Current Titles
```bash
npm run check:titles
```

### Improve Titles (Dry Run)
```bash
npm run improve:titles:dry-run
```

### Improve Titles (Apply Changes)
```bash
npm run improve:titles
```

## Script Features

### Automatic Detection
- Detects generic titles (e.g., "USB Ladekabel", "Tastatur")
- Uses product descriptions to add context
- Combines name + description for better results

### Safety Features
- Dry-run mode for testing
- Logs all changes (old → new)
- Preserves existing slugs (avoids conflicts)
- No hard deletes

### Validation
- Removes duplicate words
- Ensures minimum length (5 characters, 2+ words)
- Adds context if title is too generic
- Capitalizes first letter

## Current Status

All 23 products have been processed and improved. Titles are now:
- ✅ Short and clear (3-8 words)
- ✅ Free of model IDs and geographical references
- ✅ Professional and consistent
- ✅ Include key distinguishing features

## Files

- `scripts/improve-product-titles.ts` - Main improvement script
- `scripts/check-product-titles.ts` - Quick title checker
- `package.json` - NPM scripts

## Future Improvements

1. **Category-specific rules**: More nuanced rules per product category
2. **Slug generation**: Auto-generate SEO-friendly slugs from improved titles
3. **Validation on import**: Prevent generic titles when importing new products
4. **Manual override**: Allow manual title editing in admin panel

## Troubleshooting

### Title Too Generic
If a title is still too generic (e.g., "USB Ladekabel"), the script will:
1. Check product description for more context
2. Extract key features (length, power, type)
3. Add distinguishing attributes

### Duplicate Titles
If multiple products have the same title:
- Script will add more context from descriptions
- Consider manual review for very similar products

### Title Not Improving
If a title doesn't improve:
- Check if it already meets the criteria
- Review description for additional context
- May need manual adjustment

