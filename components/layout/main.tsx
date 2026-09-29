import type { ReactNode } from "react";

export function Main({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="min-w-0 flex-1 overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 md:py-8 lg:px-8">
        <div className="page-enter space-y-6">{children}</div>
      </div>
    </main>
  );
}
