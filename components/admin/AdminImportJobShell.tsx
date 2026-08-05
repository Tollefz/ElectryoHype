"use client";

import type { ReactNode } from "react";
import { ImportJobProvider } from "@/components/admin/ImportJobProvider";
import { ImportStatusWidget } from "@/components/admin/ImportStatusWidget";
import { DeskWidgetBoundary } from "@/components/admin/DeskWidgetBoundary";

export function AdminImportJobShell({ children }: { children: ReactNode }) {
  return (
    <ImportJobProvider>
      {children}
      <DeskWidgetBoundary name="Import status">
        <ImportStatusWidget />
      </DeskWidgetBoundary>
    </ImportJobProvider>
  );
}
