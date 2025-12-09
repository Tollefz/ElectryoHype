export function abandonedCartEmail2({
  items,
}: {
  items: Array<{ name: string; quantity?: number }>;
}) {
  const list = items
    .slice(0, 5)
    .map((i) => `• ${i.name}${i.quantity ? ` x${i.quantity}` : ""}`)
    .join("\n");

  return {
    subject: "Varene dine venter fortsatt",
    text: `Hei igjen! Handlekurven din er lagret.\n\n${list}\n\nVi sender så snart du fullfører.`,
  };
}

