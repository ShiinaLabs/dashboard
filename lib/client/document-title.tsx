import { createContext, useContext, useEffect, useState } from "react";
import { useMatches } from "react-router";
import { useTranslation } from "react-i18next";
import { type PageTitleKey, type TitleHandle } from "@/lib/page-titles";

/**
 * Localizes `document.title` after hydration.
 *
 * Route `meta` has to stay language-neutral (see lib/page-titles.ts) so the
 * server and the client's first render agree on the head; it therefore emits
 * the English title, and this provider rewrites it in the page's own language
 * once mounted — which is the same point at which app/providers.tsx starts
 * rendering detected translations at all.
 */

type SetEntityTitle = (name: string | null) => void;

const EntityTitleContext = createContext<SetEntityTitle | null>(null);

/** Deepest route with a title handle — child routes override their parents. */
function titleKeyFrom(matches: ReturnType<typeof useMatches>): PageTitleKey | null {
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i].handle as Partial<TitleHandle> | undefined;
    if (handle?.titleKey) return handle.titleKey;
  }
  return null;
}

export function DocumentTitleProvider({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const matches = useMatches();
  const [entity, setEntity] = useState<string | null>(null);

  const titleKey = titleKeyFrom(matches);

  useEffect(() => {
    // Routes without a handle (404) keep the English title their meta emitted
    // rather than being flattened to the bare app name.
    if (!titleKey) return;

    document.title = [entity, t(titleKey), t("common.dashboard")]
      .filter((part) => part && part.length > 0)
      .join(" · ");
    // `i18n.language` is listed so a language switch re-runs this with the
    // freshly bound `t`.
  }, [entity, i18n.language, t, titleKey]);

  return <EntityTitleContext.Provider value={setEntity}>{children}</EntityTitleContext.Provider>;
}

/**
 * Contributes an entity name (account handle, repo, project) to the tab title
 * of the enclosing route: `kaoru · GitHub · Data Hub`. Pass undefined while the
 * query is still loading; the page title renders on its own until then.
 */
export function useEntityTitle(name: string | null | undefined) {
  const setEntity = useContext(EntityTitleContext);

  useEffect(() => {
    if (!setEntity) return;
    setEntity(name ?? null);
    return () => setEntity(null);
  }, [setEntity, name]);
}
