# Mantine Full Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分两个阶段将 Dashboard 的 UI 组件系统全面迁移到 Mantine，并优先彻底统一数据卡片的结构、主题、响应式布局和加载状态。

**Architecture:** Mantine 成为所有通用 UI 控件、设计 token、反馈和覆盖层的唯一组件来源；Tailwind 保留为页面布局和少量非组件 utility，不再直接承担 Button/Input/Card/Dialog 等控件样式。第一阶段升级运行时、接入 Provider/主题桥并完成数据展示层；第二阶段迁移交互控件、表单、覆盖层和反馈系统，删除旧的本地 UI 实现。

**Tech Stack:** Node.js 20, pnpm 10.34.5, React 19, React Router 7 Framework Mode/SSR, Mantine 9.6.0, Tailwind CSS v4, Recharts, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-08-29-frontend-engineering-design.md`（本计划对其中“shadcn/ui”组件层决策作 Mantine 替换）

## Global Constraints

- Mantine packages pin to `9.6.0`; `@mantine/core` and `@mantine/hooks` must use the same version.
- Node.js floor is `20.0.0`; keep the existing local engine declaration, Docker images, CI image and deployment documentation aligned with the available registry images.
- MantineProvider is rendered exactly once at the application root; SSR must include `ColorSchemeScript` and `mantineHtmlProps`.
- Existing 12 `data-theme` themes remain user-visible; their token definitions move to one typed source and feed both page CSS variables and Mantine variables.
- Tailwind remains for layout utilities, but Tailwind Preflight is disabled; Mantine package styles use `styles.layer.css` only when layer ordering is required, never together with `styles.css`.
- Recharts remains the chart engine; no backend, API, authentication, fetcher or database changes.
- Do not commit or push without explicit user permission.

## File Structure

**Create:**

- `lib/client/mantine-theme.ts` — typed theme tokens, Mantine theme override and CSS variable resolver.
- `components/domain/shared/MetricCard.tsx` — canonical metric card, compact variant and exact loading skeleton.
- `components/domain/shared/MetricGrid.tsx` — responsive metric-card grid with one layout contract.
- `components/ui/index.ts` — project-owned exports for approved Mantine primitives.
- `tests/mantine-theme.test.ts` — theme mapping and light/dark state invariants.
- `tests/metric-card.test.tsx` — server-rendered metric card structure and skeleton invariants.

**Modify in Stage 1:**

- `package.json`, `pnpm-lock.yaml` — Mantine dependencies and Node 20 engine.
- `Dockerfile`, `Dockerfile.ci`, `.gitlab-ci.yml` — Node 20 build/runtime images.
- `app/root.tsx`, `app/providers.tsx` — Mantine styles, root Provider and SSR color scheme setup.
- `app/globals.css` — disable Tailwind Preflight, preserve dashboard tokens and define layer order.
- `lib/client/themes.ts`, `components/ThemeProvider.tsx` — expose one theme state to both systems.
- `components/domain/shared/OverviewCards.tsx`, `components/StatCard.tsx`, `components/Skeleton.tsx` — replace duplicated stat-card implementations.
- `components/ui/card.tsx`, `components/ui/BaseCard.tsx` — remove after all data-display consumers migrate.
- `app/(dashboard)/overview/*.tsx` — migrate overview cards, chart containers and tables.
- `app/(dashboard)/github/[accountId]/page.tsx`, `app/(dashboard)/gitlab/[accountId]/page.tsx`, `app/(dashboard)/reddit/[id]/page.tsx`, `app/(dashboard)/x/[id]/page.tsx` — migrate detail-page stat/chart cards.
- `docs/FRONTEND.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` — document Mantine and Node 20.

**Modify in Stage 2:**

- `components/ui/ConfirmDialog.tsx`, `components/ui/Portal.tsx`, `components/ui/badge.tsx`, `components/ui/separator.tsx` — replace with Mantine-backed wrappers or remove.
- `components/Layout.tsx`, `components/AccountActiveButton.tsx`, `components/AiChatUI.tsx`, `components/FloatingAiChat.tsx`, `components/FetchRunHistory.tsx`, `components/TimeRangeSelector.tsx`, `components/TriggerPanel.tsx` — migrate shared interactive UI.
- `app/login/page.tsx`, `app/(dashboard)/accounts/page.tsx`, `app/(dashboard)/admin/page.tsx`, `app/(dashboard)/settings/page.tsx` — migrate forms and controls.
- `app/(dashboard)/github/[accountId]/page.tsx`, `app/(dashboard)/github/[accountId]/repos/[repoId]/page.tsx`, `app/(dashboard)/gitlab/[accountId]/page.tsx`, `app/(dashboard)/gitlab/[accountId]/projects/[projectId]/page.tsx`, `app/(dashboard)/reddit/[id]/page.tsx`, `app/(dashboard)/x/[id]/page.tsx` — migrate remaining buttons, inputs, selects and dialogs.
- `tests/e2e/overview.spec.ts`, `tests/e2e/mantine-ui.spec.ts` — responsive, theme and interaction smoke coverage.

---

## Stage 1 — Foundation and Data Cards

### Task 1: Upgrade runtime and install Mantine

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `Dockerfile`
- Modify: `Dockerfile.ci`
- Modify: `.gitlab-ci.yml`
- Modify: `README.md`, `docs/DEPLOYMENT.md`

**Interfaces:**

- Consumes: current Node 20/pnpm build configuration.
- Produces: Node 20 runtime and `@mantine/core@9.6.0` + `@mantine/hooks@9.6.0` available to all later tasks.

- [x] **Step 1: Add a failing compatibility check**

```bash
node -e 'const v=process.versions.node.split(".").map(Number); if (v[0] < 22) process.exit(1)'
```

Expected: FAIL on the current Node 20 environment.

- [x] **Step 2: Update runtime and dependencies**

Keep `engines.node` at `^20.0.0`, keep all build/runtime images and the CI image on Node 20, then run:

```bash
pnpm add @mantine/core@9.6.0 @mantine/hooks@9.6.0
```

- [x] **Step 3: Verify dependency graph**

Run `pnpm install --frozen-lockfile` and `pnpm exec tsc --noEmit` under Node 20. Expected: lockfile is reproducible and the existing typecheck still passes.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml Dockerfile Dockerfile.ci .gitlab-ci.yml README.md docs/DEPLOYMENT.md
git commit -m "build: upgrade runtime for Mantine"
```

### Task 2: Add root Provider and single theme bridge

**Files:**

- Create: `lib/client/mantine-theme.ts`
- Create: `tests/mantine-theme.test.ts`
- Modify: `app/root.tsx`
- Modify: `app/providers.tsx`
- Modify: `app/globals.css`
- Modify: `lib/client/themes.ts`
- Modify: `components/ThemeProvider.tsx`

**Interfaces:**

- Consumes: existing `ThemeSettings`, `themes`, `resolveTheme` and `applyTheme`.
- Produces: `dashboardThemeTokens`, `createDashboardMantineTheme(themeId)`, `dashboardCssVariablesResolver`, and a single Mantine color-scheme state for all components.

- [x] **Step 1: Write failing theme invariants**

```ts
it("maps every dashboard theme to Mantine tokens", () => {
  for (const theme of themes) {
    const resolved = createDashboardMantineTheme(theme.id);
    expect(resolved.primaryColor).toBe("primary");
    expect(resolved.colors?.primary).toHaveLength(10);
  }
});

it("keeps dark state aligned with the dashboard theme", () => {
  expect(resolveColorScheme("default-dark")).toBe("dark");
  expect(resolveColorScheme("default-light")).toBe("light");
});
```

- [x] **Step 2: Implement typed token mapping**

Move the 12 theme token sets into a typed source. Define these interfaces:

```ts
export interface DashboardThemeTokens {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  card: string;
  cardForeground: string;
  ring: string;
  success: string;
  warn: string;
  danger: string;
}

export function createDashboardMantineTheme(themeId: string): MantineThemeOverride;
export function dashboardCssVariablesResolver(theme: MantineTheme): CSSVariablesResolver;
export function resolveColorScheme(themeId: string): "light" | "dark";
```

Use explicit 10-shade Mantine palettes per theme instead of duplicating independent light/dark state. Preserve the existing `data-theme` attribute for legacy page styles during migration.

- [x] **Step 3: Integrate SSR-safe Provider**

Import `@mantine/core/styles.layer.css` before application CSS, render one `MantineProvider` inside `Providers`, and add `ColorSchemeScript` plus `mantineHtmlProps` to `app/root.tsx`. Keep the existing hydration guard and set Mantine's forced scheme from the resolved dashboard theme.

- [x] **Step 4: Disable Tailwind Preflight and verify theme invariants**

Replace the all-in-one Tailwind import with the v4 theme/utilities imports needed by the project, omitting `preflight.css`. Run:

```bash
pnpm vitest run tests/mantine-theme.test.ts
```

Expected: PASS for all 12 themes.

- [ ] **Step 5: Commit**

```bash
git add lib/client/mantine-theme.ts tests/mantine-theme.test.ts app/root.tsx app/providers.tsx app/globals.css lib/client/themes.ts components/ThemeProvider.tsx
git commit -m "feat(ui): add Mantine provider and theme bridge"
```

### Task 3: Define the canonical metric-card system

**Files:**

- Create: `components/domain/shared/MetricCard.tsx`
- Create: `components/domain/shared/MetricGrid.tsx`
- Create: `tests/metric-card.test.tsx`
- Modify: `components/domain/shared/OverviewCards.tsx`
- Modify: `components/StatCard.tsx`
- Modify: `components/Skeleton.tsx`

**Interfaces:**

- Consumes: `MantineProvider`, dashboard theme tokens and `ReactNode` icons.
- Produces: `MetricCard`, `MetricCardSkeleton`, `MetricGrid`, `MetricCardProps`, and `MetricCardDensity`.

- [x] **Step 1: Write failing SSR structure tests**

```tsx
it("renders stable label, value, hint and icon slots", () => {
  const html = renderToStaticMarkup(
    <MetricCard icon={<span>icon</span>} label="Followers" value={12345} hint="Today +12" />,
  );
  expect(html).toContain("Followers");
  expect(html).toContain("12,345");
  expect(html).toContain("Today +12");
  expect(html).toContain("data-slot=\"metric-icon\"");
});

it("keeps loading geometry equivalent to the card", () => {
  const html = renderToStaticMarkup(<MetricCardSkeleton />);
  expect(html).toContain("data-slot=\"metric-skeleton-icon\"");
  expect(html).toContain("data-slot=\"metric-skeleton-value\"");
});
```

- [x] **Step 2: Implement one canonical card contract**

Use Mantine `Card`, `ThemeIcon`, `Stack`, `Group`, `Text` and `NumberFormatter`. The component must expose fixed icon dimensions, a minimum card height, `min-width: 0` for text, a two-line-safe label/hint area, tabular numeric value styling, and explicit `density="default" | "compact"`. Do not accept preformatted values as the normal API; format numbers inside the card.

- [x] **Step 3: Implement the matching skeleton**

Use Mantine `Skeleton` with the same outer padding, icon slot, label line, value line and hint line as `MetricCard`. Do not maintain a separate hand-written skeleton geometry in `components/Skeleton.tsx`.

- [x] **Step 4: Implement one responsive grid contract**

Define `MetricGrid` over Mantine `SimpleGrid` with responsive `cols`, `spacing` and `verticalSpacing`. Replace page-local `grid-cols-2 md:grid-cols-4/5` decisions with props such as `columns="four" | "five"`.

- [ ] **Step 5: Run focused tests and commit**

Run `pnpm vitest run tests/metric-card.test.tsx`. Expected: PASS.

```bash
git add components/domain/shared/MetricCard.tsx components/domain/shared/MetricGrid.tsx tests/metric-card.test.tsx components/domain/shared/OverviewCards.tsx components/StatCard.tsx components/Skeleton.tsx
git commit -m "feat(ui): standardize metric cards"
```

### Task 4: Migrate all data-display cards

**Files:**

- Modify: `app/(dashboard)/overview/page.tsx`
- Modify: `app/(dashboard)/overview/FetchHealthSection.tsx`
- Modify: `app/(dashboard)/overview/GitHubSection.tsx`
- Modify: `app/(dashboard)/overview/GitLabSection.tsx`
- Modify: `app/(dashboard)/overview/PulseSection.tsx`
- Modify: `app/(dashboard)/overview/RedditSection.tsx`
- Modify: `app/(dashboard)/overview/TopContentSection.tsx`
- Modify: `app/(dashboard)/overview/XSection.tsx`
- Modify: `app/(dashboard)/github/[accountId]/page.tsx`
- Modify: `app/(dashboard)/gitlab/[accountId]/page.tsx`
- Modify: `app/(dashboard)/reddit/[id]/page.tsx`
- Modify: `app/(dashboard)/x/[id]/page.tsx`
- Modify: `components/ui/card.tsx`, `components/ui/BaseCard.tsx`

**Interfaces:**

- Consumes: `MetricCard`, `MetricCardSkeleton`, `MetricGrid` from Task 3.
- Produces: every stat card and data-display card uses Mantine-backed shared components; no page imports the old `Card` or `BaseCard` implementation.

- [x] **Step 1: Replace stat-card consumers**

Replace all `StatCard`, `StatCompactCard`, `StatCardSkeleton` and page-local stat grids with `MetricCard`, `MetricCardSkeleton` and `MetricGrid`. Keep the existing translated labels and numeric semantics unchanged.

- [x] **Step 2: Replace chart/table containers**

Use Mantine `Card`/`Paper`, `Card.Section`, `Stack`, `Group`, `Text` and `Table` for chart headers, empty states and top-content tables. Keep Recharts inside the Mantine card body and preserve existing responsive chart heights.

- [x] **Step 3: Remove old card implementation after import audit**

Run:

```bash
rg -n 'components/ui/(card|BaseCard)|StatCompactCard|StatCardSkeleton|<Card\b|<BaseCard\b' app components
```

Expected: no legacy data-card consumers. Delete only the now-unused local card files and remove their exports.

- [ ] **Step 4: Run Stage 1 verification**

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm run build` and the existing mock overview smoke test. Expected: all pass; overview renders at 375px, 768px and desktop without horizontal overflow.

- [ ] **Step 5: Commit Stage 1**

```bash
git add app components lib tests docs
git commit -m "feat(ui): migrate data display to Mantine"
```

## Stage 2 — Full Interactive UI Migration

### Task 5: Add Mantine-backed shared interactive primitives

**Files:**

- Create/modify: `components/ui/index.ts`
- Modify: `components/ui/ConfirmDialog.tsx`, `components/ui/Portal.tsx`, `components/ui/badge.tsx`, `components/ui/separator.tsx`
- Modify: `app/providers.tsx`
- Modify: `app/globals.css`

**Interfaces:**

- Consumes: Mantine theme bridge and the Stage 1 Provider.
- Produces: approved project wrappers for `Button`, `ActionIcon`, `TextInput`, `PasswordInput`, `Textarea`, `Select`, `NativeSelect`, `Switch`, `Tabs`, `Modal`, `Drawer`, `Menu`, `Tooltip`, `Badge`, `Divider`, `Skeleton`, `LoadingOverlay` and Notifications.

- [x] **Step 1: Write wrapper API tests**

Assert that the wrapper exports are present and that `ConfirmDialog` preserves `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `target`, `action` and `onConfirm` behavior.

- [x] **Step 2: Implement theme-level defaults**

Configure consistent radius, control heights, focus ring, default button variants, input error styles and disabled/loading behavior in `theme.components`. Mount `Notifications` once under `MantineProvider`.

- [x] **Step 3: Replace custom overlay behavior**

Rewrite `ConfirmDialog`, sidebar drawer and pin dialogs with Mantine `Modal`/`Drawer`/`FocusTrap` primitives. Preserve destructive confirmation token logic and existing i18n labels.

- [x] **Step 4: Verify primitives**

Run focused tests plus `pnpm typecheck`. Expected: PASS with no direct provider duplication and no `styles.css`/`styles.layer.css` double import.

- [ ] **Step 5: Commit**

```bash
git add components/ui app/providers.tsx app/globals.css tests
git commit -m "feat(ui): add Mantine interactive primitives"
```

### Task 6: Migrate shared controls and forms

**Files:**

- Modify: `components/Layout.tsx`
- Modify: `components/AccountActiveButton.tsx`
- Modify: `components/AiChatUI.tsx`
- Modify: `components/FloatingAiChat.tsx`
- Modify: `components/FetchRunHistory.tsx`
- Modify: `components/TimeRangeSelector.tsx`
- Modify: `components/TriggerPanel.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/(dashboard)/accounts/page.tsx`
- Modify: `app/(dashboard)/admin/page.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

**Interfaces:**

- Consumes: shared primitives from Task 5 and existing `api`, i18n and mutation handlers.
- Produces: all shared controls and forms use Mantine components without changing API payloads or business behavior.

- [x] **Step 1: Migrate one form first**

Convert login to `Stack`, `TextInput`, `PasswordInput`, `Button` and `Alert`, preserving submit behavior, translated error messages and disabled state. Add a focused test for invalid and successful submit states.

- [x] **Step 2: Migrate settings/accounts/admin forms**

Convert text/password inputs, selects, tab selectors, submit buttons and cookie key/value rows. Keep controlled values and mutation functions unchanged; use `@mantine/form` only where it removes duplicated field/error handling rather than wrapping every existing input automatically.

- [x] **Step 3: Migrate shared navigation/chat controls**

Convert sidebar toggle, account active action, time-range selector, trigger panel, floating chat and chat composer to `Button`/`ActionIcon`/`SegmentedControl`/`Select`/`Textarea` with explicit labels and loading states.

- [x] **Step 4: Audit native control usage**

Run:

```bash
rg -n '<(button|input|select|textarea)\\b' app components -g '*.tsx'
```

Expected: no application-level native interactive controls remain except elements intentionally rendered by Mantine or chart/library internals.

- [ ] **Step 5: Commit**

```bash
git add components app tests
git commit -m "feat(ui): migrate forms and shared controls to Mantine"
```

### Task 7: Migrate remaining route-level overlays and data controls

**Files:**

- Modify: `app/(dashboard)/github/[accountId]/page.tsx`
- Modify: `app/(dashboard)/github/[accountId]/repos/[repoId]/page.tsx`
- Modify: `app/(dashboard)/gitlab/[accountId]/page.tsx`
- Modify: `app/(dashboard)/gitlab/[accountId]/projects/[projectId]/page.tsx`
- Modify: `app/(dashboard)/reddit/[id]/page.tsx`
- Modify: `app/(dashboard)/x/[id]/page.tsx`
- Modify: `app/(dashboard)/overview/*.tsx`

**Interfaces:**

- Consumes: shared Mantine primitives and Stage 1 card components.
- Produces: route-level back buttons, pin managers, delete actions, tabs, selects, menus and alerts use the same UI system.

- [x] **Step 1: Migrate account-detail actions**

Replace back/delete/pin controls and pin-management dialogs with Mantine `Button`, `ActionIcon`, `Modal`, `TextInput`, `ScrollArea` and `Alert`, preserving routes and mutation behavior.

- [x] **Step 2: Migrate repository/release controls**

Replace release filters, select-all/hide-all controls and release input controls with Mantine `Checkbox`, `Button`, `ActionIcon`, `Select` and `Table` while keeping chart series selection semantics unchanged.

- [x] **Step 3: Migrate overview actions and status feedback**

Replace time range controls, fetch-health actions, empty/error states and navigation feedback with Mantine `SegmentedControl`, `Button`, `Alert`, `Badge`, `Loader` and Notifications.

- [x] **Step 4: Delete obsolete UI implementations after audit**

Run searches for imports from `components/ui/card.tsx`, `BaseCard`, `Portal`, `ConfirmDialog`, `badge.tsx` and `separator.tsx`. Remove only files with zero consumers; keep thin wrappers that are still part of the approved project API.

- [ ] **Step 5: Commit**

```bash
git add app components tests
git commit -m "feat(ui): finish route-level Mantine migration"
```

### Task 8: Full verification and documentation

**Files:**

- Create: `tests/e2e/mantine-ui.spec.ts`
- Modify: `tests/e2e/overview.spec.ts`
- Modify: `docs/FRONTEND.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `README.md`

**Interfaces:**

- Consumes: all Stage 1 and Stage 2 UI contracts.
- Produces: repeatable browser-level checks and current project documentation.

- [x] **Step 1: Add responsive/theme smoke coverage**

Cover overview at 375px, 768px and desktop; switch at least one light and one dark custom theme; assert metric-card label/value/hint alignment, no horizontal overflow, visible focus state and one modal open/close cycle.

- [x] **Step 2: Add interaction smoke coverage**

Cover login form disabled/loading behavior, settings select/input rendering, confirm dialog Escape/Cancel behavior and one Mantine Notification.

- [x] **Step 3: Run the complete verification matrix**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright test
pnpm run build
```

Expected: all commands pass under Node 20; no hydration warnings, CSS order regressions, horizontal overflow or raw native application controls.

- [x] **Step 4: Update documentation and long-term memory**

Document Mantine as the UI system, Tailwind's reduced role, Node 20 requirement, theme bridge, migration boundaries and verification commands in the listed repo docs. Update `dashboard/Mantine 集成评估.md` and `dashboard/dashboard 索引.md` with completion status and any failed migration approaches.

- [ ] **Step 5: Commit final documentation and tests**

```bash
git add tests docs
git commit -m "docs(ui): document Mantine migration and verification"
```

## Self-Review

- [x] Two stages are independently testable: Stage 1 ends with all data-display cards migrated; Stage 2 ends with all application controls migrated.
- [x] The Node 20 requirement is explicit because the available CI and Docker registry images are Node 20.
- [x] Theme state, CSS reset/layer order, SSR and Tailwind coexistence are covered before component migration.
- [x] Data cards have a single contract and matching skeleton instead of relying on Mantine Card alone.
- [x] Recharts and backend behavior remain unchanged.
- [x] No passwords, API keys or tokens are included.
