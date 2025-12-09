export function abandonedCartEmail3({
  items,
  discountCode,
}: {
  items: Array<{ name: string; quantity?: number }>;
  discountCode?: string;
}) {
  const list = items
    .slice(0, 5)
    .map((i) => `• ${i.name}${i.quantity ? ` x${i.quantity}` : ""}`)
    .join("\n");

  return {
    subject: "Siste sjanse – vi gir deg litt rabatt",
    text: `Hei! Dette er siste påminnelse.\n\n${list}\n\n${discountCode ? `Bruk kode ${discountCode} for rabatt.` : ""}\nFullfør før varene forsvinner.`,
  };
}

