import { NextResponse } from "next/server";
import { Prisma, type SupplierName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/api-auth";
import { logError } from "@/lib/utils/logger";
import { parseTags } from "@/lib/admin/suggest-category";
import { improveProductWithAI } from "@/lib/import/improve-product";
import {
  bulkDeleteProducts,
  bulkSetProductActive,
} from "@/lib/admin/bulk-product-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BulkAction =
  | "move_category"
  | "change_supplier"
  | "archive"
  | "delete"
  | "activate"
  | "deactivate"
  | "generate_seo"
  | "run_ai"
  | "accept_category_suggestions";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

async function generateSeoFallback(name: string, category: string | null) {
  const title = truncate(`${name} | ElectroHypeX`, 60);
  const description = truncate(
    `Kjøp ${name}${category ? ` i ${category}` : ""} hos ElectroHypeX. Rask levering til Norge.`,
    160
  );
  return { metaTitle: title, metaDescription: description };
}

async function generateSeoWithAI(name: string, category: string | null, description: string | null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return generateSeoFallback(name, category);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "Du er SEO-ekspert for norske nettbutikker. Svar kun med JSON: {\"title\":\"...\",\"description\":\"...\"}",
          },
          {
            role: "user",
            content: `Generer SEO for produktside.\nNavn: ${name}\nKategori: ${category || "Elektronikk"}\nBeskrivelse: ${description || name}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return generateSeoFallback(name, category);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return generateSeoFallback(name, category);
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      metaTitle: truncate(String(parsed.title || `${name} | ElectroHypeX`), 60),
      metaDescription: truncate(
        String(parsed.description || `Kjøp ${name} hos ElectroHypeX.`),
        160
      ),
    };
  } catch {
    return generateSeoFallback(name, category);
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const action = body.action as BulkAction;
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.filter((id: unknown) => typeof id === "string")
      : [];

    if (!action || ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "action og ids er påkrevd" },
        { status: 400 }
      );
    }

    if (ids.length > 250) {
      return NextResponse.json(
        { ok: false, error: "Maks 250 produkter per bulk-handling" },
        { status: 400 }
      );
    }

    const results: { id: string; ok: boolean; error?: string }[] = [];

    if (action === "move_category") {
      const category = typeof body.category === "string" ? body.category : "";
      const subcategory =
        typeof body.subcategory === "string" ? body.subcategory : null;
      const { assertMainCategory, normalizeSubcategory } = await import(
        "@/lib/categories/tree"
      );
      const valid = assertMainCategory(category);
      if (!valid) {
        return NextResponse.json(
          { ok: false, error: "Ugyldig hovedkategori (kun butikkens allowlist)" },
          { status: 400 }
        );
      }
      const validSub = normalizeSubcategory(valid, subcategory);
      const products = await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, category: true, subcategory: true },
      });
      const { recordCategoryCorrection } = await import(
        "@/lib/ops/category-learning"
      );
      for (const p of products) {
        await prisma.product.update({
          where: { id: p.id },
          data: {
            category: valid,
            subcategory: validSub,
            aiCategoryStatus: "corrected",
            aiCategorySuggested: valid,
            aiCategoryAt: new Date(),
          },
        });
        await recordCategoryCorrection({
          productId: p.id,
          productName: p.name,
          fromCategory: p.category,
          toCategory: valid,
          fromSubcategory: p.subcategory,
          toSubcategory: validSub,
          reason: "Bulk flytt kategori",
        });
      }
      return NextResponse.json({
        ok: true,
        updated: products.length,
        results: products.map((p) => ({ id: p.id, ok: true })),
      });
    }

    if (action === "change_supplier") {
      const supplierName = body.supplierName as SupplierName | null | "";
      const value =
        supplierName === "" || supplierName === null
          ? null
          : (["temu", "alibaba", "ebay"].includes(String(supplierName))
              ? (supplierName as SupplierName)
              : null);
      if (supplierName && value === null) {
        return NextResponse.json({ ok: false, error: "Ugyldig leverandør" }, { status: 400 });
      }
      await prisma.product.updateMany({
        where: { id: { in: ids } },
        data: { supplierName: value },
      });
      return NextResponse.json({
        ok: true,
        updated: ids.length,
        results: ids.map((id) => ({ id, ok: true })),
      });
    }

    if (action === "activate") {
      const result = await bulkSetProductActive(ids, true, false);
      return NextResponse.json({
        ok: true,
        updated: result.updated,
        skipped: result.skipped,
        results: result.results,
      });
    }

    if (action === "deactivate") {
      const result = await bulkSetProductActive(ids, false, false);
      return NextResponse.json({
        ok: true,
        updated: result.updated,
        skipped: result.skipped,
        results: result.results,
      });
    }

    if (action === "archive") {
      const result = await bulkSetProductActive(ids, false, true);
      return NextResponse.json({
        ok: true,
        updated: result.updated,
        skipped: result.skipped,
        results: result.results,
      });
    }

    if (action === "delete") {
      const result = await bulkDeleteProducts(ids);
      return NextResponse.json({
        ok: true,
        updated: result.updated,
        skipped: result.skipped,
        results: result.results,
        message:
          result.skipped > 0
            ? `Slettet ${result.updated} produkter (${result.skipped} hoppet over pga. ordrer)`
            : `Slettet ${result.updated} produkter`,
      });
    }

    if (action === "generate_seo") {
      const products = await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, category: true, description: true },
      });

      for (const product of products) {
        try {
          const seo = await generateSeoWithAI(
            product.name,
            product.category,
            product.description
          );
          await prisma.product.update({
            where: { id: product.id },
            data: seo,
          });
          results.push({ id: product.id, ok: true });
        } catch (error) {
          results.push({
            id: product.id,
            ok: false,
            error: error instanceof Error ? error.message : "SEO feilet",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        updated: results.filter((r) => r.ok).length,
        results,
      });
    }

    if (action === "run_ai") {
      const products = await prisma.product.findMany({
        where: { id: { in: ids } },
      });

      for (const product of products) {
        try {
          let specs: Record<string, string> = {};
          if (product.specs && typeof product.specs === "object" && !Array.isArray(product.specs)) {
            specs = Object.fromEntries(
              Object.entries(product.specs as Record<string, unknown>).map(([k, v]) => [
                k,
                String(v ?? ""),
              ])
            );
          }

          const improved = await improveProductWithAI({
            originalName: product.name,
            originalDescription: product.description || "",
            originalPrice: product.supplierPrice || product.price,
            name: product.name,
            description: product.description || "",
            shortDescription: product.shortDescription || "",
            category: product.category || "Hjem & Fritid",
            tags: parseTags(product.tags),
            slug: product.slug,
            metaTitle: product.metaTitle || "",
            metaDescription: product.metaDescription || "",
            suggestedPrice: product.price,
            compareAtPrice: product.compareAtPrice || product.price,
            specs,
          });

          const updates = improved.updates;
          await prisma.product.update({
            where: { id: product.id },
            data: {
              ...(updates.name !== undefined ? { name: updates.name } : {}),
              ...(updates.description !== undefined
                ? { description: updates.description }
                : {}),
              ...(updates.shortDescription !== undefined
                ? { shortDescription: updates.shortDescription }
                : {}),
              ...(updates.category !== undefined ? { category: updates.category } : {}),
              ...(updates.tags !== undefined ? { tags: JSON.stringify(updates.tags) } : {}),
              ...(updates.metaTitle !== undefined ? { metaTitle: updates.metaTitle } : {}),
              ...(updates.metaDescription !== undefined
                ? { metaDescription: updates.metaDescription }
                : {}),
              ...(updates.suggestedPrice !== undefined
                ? { price: updates.suggestedPrice }
                : {}),
              ...(updates.compareAtPrice !== undefined
                ? { compareAtPrice: updates.compareAtPrice }
                : {}),
            },
          });
          results.push({ id: product.id, ok: true });
        } catch (error) {
          results.push({
            id: product.id,
            ok: false,
            error: error instanceof Error ? error.message : "AI feilet",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        updated: results.filter((r) => r.ok).length,
        results,
      });
    }

    if (action === "accept_category_suggestions") {
      const suggestions = body.suggestions as
        | Record<string, { category: string; subcategory?: string | null }>
        | undefined;

      if (!suggestions || typeof suggestions !== "object") {
        return NextResponse.json(
          { ok: false, error: "suggestions er påkrevd" },
          { status: 400 }
        );
      }

      for (const id of ids) {
        const suggestion = suggestions[id];
        if (!suggestion?.category) {
          results.push({ id, ok: false, error: "Mangler forslag" });
          continue;
        }

        const product = await prisma.product.findUnique({
          where: { id },
          select: { specs: true, tags: true },
        });
        if (!product) {
          results.push({ id, ok: false, error: "Ikke funnet" });
          continue;
        }

        const specs: Record<string, string> = {};
        if (product.specs && typeof product.specs === "object" && !Array.isArray(product.specs)) {
          const raw = product.specs as Record<string, unknown>;
          for (const [key, value] of Object.entries(raw)) {
            if (typeof value === "string") specs[key] = value;
          }
        }
        if (suggestion.subcategory) {
          specs["Underkategori"] = suggestion.subcategory;
        }

        await prisma.product.update({
          where: { id },
          data: {
            category: suggestion.category,
            subcategory: suggestion.subcategory || null,
            specs:
              Object.keys(specs).length > 0
                ? (specs as Prisma.InputJsonValue)
                : undefined,
            aiCategorySuggested: suggestion.category,
            aiCategoryStatus: "applied",
            aiCategoryAt: new Date(),
          },
        });
        results.push({ id, ok: true });
      }

      return NextResponse.json({
        ok: true,
        updated: results.filter((r) => r.ok).length,
        results,
      });
    }

    return NextResponse.json({ ok: false, error: "Ukjent action" }, { status: 400 });
  } catch (error) {
    logError(error, "[api/admin/products/bulk]");
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Bulk-handling feilet",
      },
      { status: 500 }
    );
  }
}
