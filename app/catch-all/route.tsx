import { json } from "@/lib/api-server";
import { Link, type MetaFunction } from "react-router";
import { titleFor } from "@/lib/page-titles";

// No title handle: the page body below is untranslated too, and
// lib/client/document-title.tsx leaves the meta title alone when a route has
// no handle rather than flattening it to the bare app name.
export const meta: MetaFunction = () => [{ title: titleFor("Page not found") }];

/**
 * Catch-all route: matches any URL that no concrete route handles.
 *
 * Without this, the React Router dev server throws an unhandled
 * "No route matches URL ..." error (500) for unknown paths — e.g. Chrome
 * DevTools requesting /.well-known/appspecific/com.chrome.devtools.json,
 * or a stale bookmark/typo. Return a rendered 404 page; unknown /api/*
 * paths are handled separately as JSON by catch-all/api-route.ts.
 */
export async function loader() {
  // Matched document requests always render as HTML; return 404 so the
  // browser/DevTools sees a proper "not found" instead of a dev-server 500.
  return json({ notFound: true }, { status: 404 });
}

export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-[var(--background)] px-4 text-center">
      <p className="text-6xl font-semibold text-[var(--foreground)]">404</p>
      <p className="text-sm text-[var(--muted-foreground)]">
        Page not found
      </p>
      <Link
        to="/"
        className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
