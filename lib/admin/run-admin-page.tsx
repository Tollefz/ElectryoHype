import type { ReactNode } from "react";
import { DataState } from "@/components/admin/DataState";
import { classifyAdminError, type AdminSurface } from "@/lib/admin/data-errors";
import { logAdminError } from "@/lib/admin/admin-logger";
import { failureStatus } from "@/lib/admin/load-state";

/**
 * Run an admin server page body without ever letting exceptions escape.
 * Failures render ErrorState — never Empty.
 */
export async function runAdminPage(
  surface: AdminSurface,
  route: string,
  render: () => Promise<ReactNode>
): Promise<ReactNode> {
  try {
    return await render();
  } catch (error: unknown) {
    const classified = classifyAdminError(error);
    logAdminError(error, { route, label: `page:${surface}` });
    return (
      <DataState
        status={failureStatus(classified.kind)}
        surface={surface}
        error={classified}
      />
    );
  }
}
