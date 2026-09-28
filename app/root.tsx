import { Links, Meta, Outlet, Scripts, ScrollRestoration, type MetaFunction } from "react-router";
import { Providers } from "./providers";
import { middleware } from "./auth-middleware.server";
import { DocumentTitleProvider } from "@/lib/client/document-title";
import { titleFor } from "@/lib/page-titles";
import "./globals.css";

export { middleware };

/**
 * Fallback tab title for routes that set none of their own (including the
 * `(dashboard)` layout itself). Page routes override it through their own
 * `meta`; see lib/page-titles.ts for why the title is not localized here.
 */
export const meta: MetaFunction = () => [{ title: titleFor() }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Multi-platform data dashboard" />
        <link rel="icon" href="/favicon.ico" />
        <Meta />
        <Links />
      </head>
      <body>
        <Providers>{children}</Providers>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return (
    <DocumentTitleProvider>
      <Outlet />
    </DocumentTitleProvider>
  );
}
