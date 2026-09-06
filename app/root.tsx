import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { Providers } from "./providers";
import { middleware } from "./auth-middleware.server";
import "./globals.css";

export { middleware };

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Multi-platform data dashboard" />
        <link rel="icon" href="/favicon.ico" />
        <ColorSchemeScript defaultColorScheme="light" />
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
  return <Outlet />;
}
