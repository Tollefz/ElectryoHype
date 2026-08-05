import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CartStatus } from "@prisma/client";
import { sendWinBack } from "@/lib/marketing/emailFlows/winBack";
import { abandonedCartEmail1 } from "@/lib/marketing/emailTemplates/abandonedCart1";
import { abandonedCartEmail2 } from "@/lib/marketing/emailTemplates/abandonedCart2";
import { abandonedCartEmail3 } from "@/lib/marketing/emailTemplates/abandonedCart3";
import { requireInternalToken } from "@/lib/api-auth";

function toSafeCartItems(items: unknown): { name: string; quantity?: number }[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    if (!item || typeof item !== "object") {
      return { name: "Unknown item" };
    }
    const obj = item as Record<string, unknown>;
    const name =
      typeof obj.name === "string" ? obj.name : String(obj.name ?? "Unknown item");
    const quantity = typeof obj.quantity === "number" ? obj.quantity : undefined;
    return { name, quantity };
  });
}

// Worker: send reminders og utløp gamle carts
export async function POST(req: Request) {
  const denied = requireInternalToken(req);
  if (denied) return denied;

  try {
    const now = Date.now();
    const carts = await prisma.abandonedCart.findMany({
      where: { status: CartStatus.ACTIVE },
    });

    let expiredCount = 0;
    let reminded24 = 0;
    let reminded48 = 0;
    const reminded72 = 0;

    for (const cart of carts) {
      const ageHours = (now - new Date(cart.lastUpdated).getTime()) / (1000 * 60 * 60);
      const items = cart.items;

      // 72h+: expire
      if (ageHours >= 72) {
        await prisma.abandonedCart.update({
          where: { id: cart.id },
          data: { status: CartStatus.EXPIRED },
        });
        expiredCount++;
        continue;
      }

      // 48h reminder
      if (ageHours >= 48 && ageHours < 72 && cart.email) {
        const safeItems = toSafeCartItems(items);
        const tpl = abandonedCartEmail2({ items: safeItems });
        await sendWinBack(cart.email); // still stub
        console.log("[abandoned-cart] send 48h", tpl);
        reminded48++;
      }

      // 24h reminder
      if (ageHours >= 24 && ageHours < 48 && cart.email) {
        const safeItems = toSafeCartItems(items);
        const tpl = abandonedCartEmail1({ items: safeItems });
        await sendWinBack(cart.email); // still stub
        console.log("[abandoned-cart] send 24h", tpl);
        reminded24++;
      }
      // 60h reminder with discount (example)
      if (ageHours >= 60 && ageHours < 72 && cart.email) {
        const safeItems = toSafeCartItems(items);
        const tpl = abandonedCartEmail3({ items: safeItems, discountCode: "SAVE10" });
        console.log("[abandoned-cart] send 60h", tpl);
      }
    }

    return NextResponse.json({ expired: expiredCount, reminded24, reminded48, reminded72 });
  } catch (error: unknown) {
    console.error("abandoned-cart worker error", error);
    const message = error instanceof Error ? error.message : "worker failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
