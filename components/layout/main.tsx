import type { ReactNode } from "react";

export function Main({ children }: { children: ReactNode }) {
  return (
    <main className="relative z-10 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div className="page-enter">{children}</div>
      </div>
    </main>
  );
}
