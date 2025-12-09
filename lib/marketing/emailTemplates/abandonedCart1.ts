export function abandonedCartEmail1({
  items,
}: {
  items: Array<{ name: string; quantity?: number }>;
}) {
  const list = items
    .slice(0, 5)
    .map((i) => `• ${i.name}${i.quantity ? ` x${i.quantity}` : ""}`)
    .join("\n");

  return {
    subject: "Glemte du noe i handlekurven?",
    text: `Hei! Vi holder av varene dine litt til.\n\n${list}\n\nFullfør bestillingen din før de blir utsolgt.`,
  };
}

