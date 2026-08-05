"use client";

import type { ReactNode } from "react";
import { AdminErrorBoundary } from "@/components/admin/AdminErrorBoundary";
import { AdminOverlayGuard } from "@/components/admin/AdminOverlayGuard";
import { ImportJobProvider } from "@/components/admin/ImportJobProvider";
import { ImportStatusWidget } from "@/components/admin/ImportStatusWidget";
import { DeskWidgetBoundary } from "@/components/admin/DeskWidgetBoundary";

/**
 * Exception-safe shell around all admin panel children.
 */
export function AdminSafeShell({ children }: { children: ReactNode }) {
  return (
    <AdminErrorBoundary name="admin-panel">
      <AdminOverlayGuard />
      <ImportJobProvider>
        {children}
        <DeskWidgetBoundary name="Import status">
          <ImportStatusWidget />
        </DeskWidgetBoundary>
      </ImportJobProvider>
    </AdminErrorBoundary>
  );
}
