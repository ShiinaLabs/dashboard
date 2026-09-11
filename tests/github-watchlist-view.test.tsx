import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import type { GithubWatchlistViewProps } from "@/components/domain/github/GithubWatchlistModal";

// No jsdom in this repo, so the modal's content is rendered as static markup.
// The translation mock keeps the key visible and appends interpolated values,
// which is what lets the assertions check both structure and copy.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}(${Object.values(options).join(",")})` : key,
  }),
}));

const { GithubWatchlistView } = await import("@/components/domain/github/GithubWatchlistModal");

const CANDIDATES = [
  { githubId: 1, githubReposId: 11, fullName: "SHIINASAMA/wifi-lens", ownerLogin: "SHIINASAMA", ownerType: "User", isPrivate: false, listedFrom: "own", watched: true, lastError: null },
  { githubId: 2, githubReposId: 12, fullName: "SHIINASAMA/pyside-template", ownerLogin: "SHIINASAMA", ownerType: "User", isPrivate: true, listedFrom: "own", watched: false, lastError: null },
  { githubId: 3, githubReposId: 13, fullName: "ShiinaLabs/dashboard", ownerLogin: "ShiinaLabs", ownerType: "Organization", isPrivate: false, listedFrom: "ShiinaLabs", watched: true, lastError: "GitHub repository 404" },
  { githubId: 4, githubReposId: 14, fullName: "SHIINASAMA/gone", ownerLogin: "SHIINASAMA", ownerType: "User", isPrivate: false, listedFrom: null, watched: true, lastError: null },
];

function render(overrides: Partial<GithubWatchlistViewProps> = {}): string {
  const props: GithubWatchlistViewProps = {
    candidates: CANDIDATES,
    sources: [{ login: "ShiinaLabs", enabled: true, lastError: null }],
    warnings: ["libsese could not be listed: GitHub org libsese 403"],
    errors: [],
    watched: new Set([1, 3, 4]),
    filter: "",
    onFilterChange: () => {},
    onToggle: () => {},
    onSelectAll: () => {},
    onSelectNone: () => {},
    orgs: ["ShiinaLabs"],
    onRemoveOrg: () => {},
    manualOrg: "",
    onManualOrgChange: () => {},
    onAddManualOrg: () => {},
    available: { orgs: [{ login: "libsese", githubId: 9, nodeId: null }], unavailable: null },
    availableLoading: false,
    ...overrides,
  };
  return renderToStaticMarkup(
    <MantineProvider>
      <GithubWatchlistView {...props} />
    </MantineProvider>,
  );
}

describe("GithubWatchlistView", () => {
  it("lists the candidates a source currently returns", () => {
    const html = render();
    expect(html).toContain("SHIINASAMA/wifi-lens");
    expect(html).toContain("ShiinaLabs/dashboard");
    expect(html.match(/data-slot="watchlist-repo-row"/g)).toHaveLength(3);
  });

  it("reflects the current selection in the checkboxes", () => {
    const html = render();
    // Three of the four are selected: the two own repos minus pyside-template
    // plus the org repo, plus the one that is no longer listed.
    expect(html.match(/checked=""/g)).toHaveLength(3);
    expect(html.match(/type="checkbox"/g)).toHaveLength(4);
  });

  it("keeps a repository that no source lists any more, and says why", () => {
    const html = render();
    expect(html).toContain('data-slot="watchlist-unavailable"');
    expect(html).toContain("SHIINASAMA/gone");
    expect(html).toContain("githubWatchlist.unavailableDesc");
  });

  it("surfaces a per-repository failure and a per-source failure", () => {
    const html = render();
    expect(html).toContain("githubWatchlist.lastError(GitHub repository 404)");
    expect(html).toContain("libsese could not be listed");
  });

  it("shows the configured organizations and explains what removing one does", () => {
    const html = render();
    expect(html).toContain("ShiinaLabs");
    // The copy must state that removal does not stop fetching already-tracked repos.
    expect(html).toContain("githubWatchlist.sourcesDesc");
    expect(html).toContain("githubWatchlist.removeOrg(ShiinaLabs)");
  });

  it("offers the organizations the token can enumerate, and a manual field", () => {
    const html = render();
    expect(html).toContain("libsese");
    expect(html).toContain("githubWatchlist.manualLabel");
    expect(html).toContain("githubWatchlist.addOrg");
  });

  it("explains an empty or unreadable organization list instead of looking broken", () => {
    expect(render({ available: { orgs: [], unavailable: null } }))
      .toContain("githubWatchlist.availableEmpty");
    expect(render({ available: { orgs: [], unavailable: "GitHub organizations 403" } }))
      .toContain("githubWatchlist.availableUnavailable(GitHub organizations 403)");
  });

  it("warns when nothing is selected, because nothing will be fetched", () => {
    expect(render({ watched: new Set() })).toContain("githubWatchlist.nothingSelected");
    expect(render()).not.toContain("githubWatchlist.nothingSelected");
  });

  it("filters the listed candidates by name", () => {
    const html = render({ filter: "dashboard" });
    expect(html).toContain("ShiinaLabs/dashboard");
    expect(html).not.toContain("SHIINASAMA/wifi-lens");
  });
});
