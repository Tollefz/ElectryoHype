export async function sendPush({
  title,
  body,
  url,
  icon,
}: {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}) {
  // Placeholder: integrate with web-push later
  console.log("[push] Would send push", { title, body, url, icon });
  return { success: true };
}

