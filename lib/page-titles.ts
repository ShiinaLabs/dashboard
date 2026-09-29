import type { MetaFunction } from "react-router";
import en from "@/locales/en.json";

/**
 * Browser tab titles.
 *
 * A route's `meta` runs on the server *and* on the client's first hydration
 * pass, so it must not read i18n: the server would emit English while the
 * browser's detected language emits something else, and React would report the
 * head as a hydration mismatch. Route `meta` therefore emits the English name
 * from `locales/en.json` (so a title is present before the app hydrates), and
 * `lib/client/document-title.tsx` rewrites `document.title` in the page's own
 * language once the client takes over.
 *
 * The locale key travels alongside in the route's `handle`, so `meta` and the
 * localized rewrite can never drift apart — see `pageMeta` and `TitleHandle`.
 */

/** Localized by the client hook; English is the pre-hydration fallback. */
export const APP_NAME = en.common.dashboard;

/** Page names, keyed by the locale key that also labels them in the UI. */
export const PAGE_TITLES = {
  "nav.overview": en.nav.overview,
  "nav.accounts": en.nav.accounts,
  "nav.x": en.nav.x,
  "nav.github": en.nav.github,
  "nav.gitlab": en.nav.gitlab,
  "nav.reddit": en.nav.reddit,
  "nav.analytics": en.nav.analytics,
  "nav.ai": en.nav.ai,
  "nav.settings": en.nav.settings,
  "nav.admin": en.nav.admin,
  "login.login": en.login.login,
} as const;

export type PageTitleKey = keyof typeof PAGE_TITLES;

/**
 * Route `handle` read back through `useMatches()`; the deepest match wins.
 * Entity detail is contributed separately (see `useEntityTitle`), because a
 * handle is static and account/repo names only arrive after their query.
 */
export interface TitleHandle {
  titleKey: PageTitleKey;
}

/** `<Page> · <App>`, or just the app name when there is no page part. */
export function titleFor(page?: string | null): string {
  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}

/** `meta` export for a page route — same markup on the server and the client. */
export function pageMeta(titleKey: PageTitleKey): MetaFunction {
  return () => [{ title: titleFor(PAGE_TITLES[titleKey]) }];
}
