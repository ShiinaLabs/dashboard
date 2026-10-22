import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { resolveWorkspace } from "@/lib/navigation/domains";

function WorkspaceBreadcrumb() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const resolved = resolveWorkspace(pathname);
  if (!resolved) return null;

  const domainLabel = t(resolved.domain.labelKey);
  const surfaceLabel = t(resolved.surface.labelKey);
  if (domainLabel === surfaceLabel) return null;

  // On a surface landing page the page title already names the surface, so the
  // trail only needs the domain. Deeper routes keep both for context.
  const atSurfaceRoot = pathname === resolved.surface.to;

  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
      <Link to={resolved.domain.to} className="transition-colors hover:text-foreground">
        {domainLabel}
      </Link>
      {!atSurfaceRoot && (
        <>
          <span aria-hidden="true">/</span>
          <span>{surfaceLabel}</span>
        </>
      )}
    </nav>
  );
}

export function Main({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="min-w-0 flex-1 overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 md:py-8 lg:px-8">
        <WorkspaceBreadcrumb />
        <div className="page-enter space-y-6">{children}</div>
      </div>
    </main>
  );
}
