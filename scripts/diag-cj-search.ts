/**
 * Diagnose CJ search — prints request outcome without secrets.
 */
import { isCjConfigured } from "../lib/suppliers/cj/api";
import { searchCjProducts } from "../lib/suppliers/cj/search";
import { createCjCatalogProvider } from "../lib/suppliers/cj/provider";
import { cjRequest } from "../lib/suppliers/cj/api";

async function main() {
  console.log("configured", await isCjConfigured());
  const provider = createCjCatalogProvider();
  console.log("provider.isConfigured", await provider.isConfigured());

  try {
    const raw = await cjRequest<unknown>({
      operation: "product.listV2.diag",
      method: "GET",
      path: "/product/listV2",
      query: {
        keyWord: "Gaming Mouse",
        page: 1,
        size: 5,
        orderBy: 1,
        sort: "desc",
        features: "enable_category",
      },
      cacheTtlMs: 0,
    });
    const shape = summarize(raw);
    console.log("raw_shape", JSON.stringify(shape, null, 2));
  } catch (e) {
    console.error("raw_error", e instanceof Error ? e.message : e);
  }

  try {
    const result = await searchCjProducts({
      query: "Gaming Mouse",
      sortBy: "bestsellers",
      page: 1,
      pageSize: 5,
    });
    console.log("mapped", {
      total: result.total,
      page: result.page,
      count: result.products.length,
      sample: result.products.slice(0, 2).map((p) => ({
        id: p.id,
        title: p.title.slice(0, 60),
        price: p.price,
        stock: p.stock,
      })),
    });
  } catch (e) {
    console.error("search_error", e instanceof Error ? e.message : e);
  }
}

function summarize(value: unknown, depth = 0): unknown {
  if (depth > 3) return typeof value;
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      first: value[0] != null ? summarize(value[0], depth + 1) : null,
    };
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v)) {
        out[k] = {
          type: "array",
          length: v.length,
          firstKeys:
            v[0] && typeof v[0] === "object"
              ? Object.keys(v[0] as object).slice(0, 20)
              : typeof v[0],
        };
      } else if (v && typeof v === "object") {
        out[k] = summarize(v, depth + 1);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return value;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
