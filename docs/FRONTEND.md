# Frontend Architecture

React Router 7 (Framework Mode) + React 19 + TypeScript + shadcn/ui + Radix UI + Tailwind CSS v4.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Router 7 (Framework Mode) + React 19 |
| UI components | shadcn/ui primitives built on Radix UI |
| Styling | shadcn CSS variables + Tailwind CSS v4 |
| Charts | Recharts |
| Icons | lucide-react |
| Data Fetching | @tanstack/react-query |
| i18n | react-i18next (JSON locale files, browser language detection) |
| Backend | React Router route handlers under `app/api/` (same process) |

Authenticated application reads use page-oriented GraphQL operations for Overview, Accounts/platform lists, X, GitHub, GitLab, Reddit, Analytics, App Store Analytics/Revenue/connections, Settings, Admin user listing, and AI status. These page operations are React Query cache units and pass `AbortSignal` to the shared transport. Commands, authentication/session, streaming, collectors, and infrastructure remain REST.

## Source Layout

```
app/
├── root.tsx             # Root layout: html shell, globals.css, Providers
├── routes.ts            # Declarative route table (pages + API)
├── auth-middleware.server.ts  # Session/auth middleware for pages + API
├── providers.tsx       # QueryClientProvider + ThemeProvider + i18n init
├── globals.css         # Tailwind import + theme CSS variables + animations
├── (dashboard)/
│   ├── layout.tsx      # Dashboard shell: Layout + MockModeBanner
│   ├── page.tsx        # Redirects / → /overview
│   ├── overview/       # Cross-platform KPIs, Web Analytics portfolio, pulse/health, top content and platform tabs
│   ├── accounts/       # Account management
│   ├── admin/          # User management (admin only)
│   ├── settings/       # App settings
│   ├── x/              # X account list + detail
│   ├── github/         # GitHub account list + detail + repo detail
│   ├── gitlab/         # GitLab account list + detail + project detail
│   ├── reddit/         # Reddit account list + detail
│   └── ai/             # AI chat workspace
├── login/page.tsx      # Login page
└── api/                # React Router route handlers (auth, accounts, fetchers, stats, …)
components/
├── layout/             # shadcn-admin-style authenticated sidebar, header and content shell
├── AccountListPage.tsx # Reusable account list component
├── BrandIcons.tsx      # Platform brand icons
├── domain/shared/      # Canonical MetricCard, MetricGrid and data-display components
├── Skeleton.tsx        # Skeleton loading primitives
├── NavigationProgress.tsx # Top progress bar while a React Router navigation is pending
├── NavigatingOverlay.tsx  # Loading surface while a React Router navigation is pending
├── ThemeProvider.tsx   # Theme context provider
├── MockModeBanner.tsx  # MOCK MODE indicator when running on fixtures
└── ui/                 # shadcn/ui primitives and dashboard controls
lib/
├── api.ts              # API client functions + TypeScript interfaces
├── client/             # i18n, themes, useIsMobile, datetime, utils
└── …                   # Server-side: db, auth, fetchers, services, scripts
locales/
├── en.json             # English translations
└── zh.json             # Simplified Chinese translations
```

## Routing

Routes are declared in `app/routes.ts` (React Router Framework Mode). All pages except `/login` live under the `(dashboard)` layout and share `app/(dashboard)/layout.tsx`; client-side navigation uses `<Link to>` / `useNavigate` from `react-router`.

| Path | Description |
|------|-------------|
| `/login` | Login page (redirects to a validated `?from=` destination or `/overview`) |
| `/` | Redirects to `/overview` |
| `/overview` | Cross-platform overview and Web Analytics portfolio summary |
| `/analytics` | Site-level first-party Web Analytics dashboard |
| `/app-store` | App Store Analytics: Overview, Acquisition and Campaigns, reading imported PostgreSQL facts |
| `/revenue` | Revenue: Overview, Sales, Subscriptions and final fiscal Settlements |
| `/accounts` | Connections: platform accounts and independent App Store Connect connections |
| `/x` | X account list |
| `/x/:id` | X account detail |
| `/github` | GitHub account list |
| `/github/:accountId` | GitHub account detail |
| `/github/:accountId/repos/:repoId` | GitHub repo detail |
| `/gitlab` | GitLab account list |
| `/gitlab/:accountId` | GitLab account detail |
| `/gitlab/:accountId/projects/:projectId` | GitLab project detail |
| `/reddit` | Reddit account list |
| `/reddit/:id` | Reddit account detail |
| `/ai` | AI chat workspace |
| `/admin` | User management (admin only) |
| `/settings` | App settings |

## Auth Flow

1. Login form calls `api.login(username, password)`; the API sets an httpOnly JWT cookie.
2. On success the login page redirects to a safe internal `?from=` path or `/overview`.
3. `AuthenticatedLayout` calls `api.checkAuth()` to resolve the current user and admin role; API requests automatically include the httpOnly cookie.
4. Logout calls `api.logout()` and redirects to `/login`.

## Data Fetching

- Uses @tanstack/react-query for caching and refetching.
- `QueryClient` is created in `app/providers.tsx` with `retry: 1` and `staleTime: 3 minutes`.
- API client in `lib/api.ts` wraps fetch calls against the route handlers under `app/api/`.
- `MOCK_DATA=1` makes the server serve fixture data from `lib/mock`; `NEXT_PUBLIC_MOCK_DATA=1` is the build-time mirror that shows the `MockModeBanner` (both are set by `pnpm run mock`).

## i18n

- Initialized in `lib/client/i18n.ts` with `react-i18next` + `i18next-browser-languagedetector`.
- Locale files in `locales/en.json` and `locales/zh.json`; fallback language is English.
- Components use `const { t } = useTranslation()` with keys like `"nav.overview"`. Keep English and Chinese files in sync when adding keys.

## Layout & Sidebar

The authenticated layout (`components/layout/authenticated-layout.tsx`) follows the shadcn-admin composition and neutral visual system:

- **Sidebar** — `SidebarProvider`, `AppSidebar` and `SidebarInset`; desktop collapse state remains persisted under `sidebar-state`.
- **Header and content** — `Header` and `Main` preserve the safe area and page content width.
- **Mobile navigation** — Radix Sheet overlay closes on Escape, backdrop click, or route selection; focus is managed by Radix.
- **Navigation** — React Router links preserve existing route URLs and active-route behavior.
- **Groups and connections** — Social contains X / Reddit; Developer contains GitHub / GitLab; Business contains Web Analytics, App Store Analytics and Revenue. AI Analysis remains a main entry. Connections uses `/accounts`, with a separate App Store Connect tab and inline connection details. Settings, Admin and Log out live in the footer user menu.
- **Overview** — cross-platform KPI cards lead into Business Pulse and Fetch Health, followed by Top Content and tabs for connected platforms.
- **Page surfaces** — management and detail pages use consistent page headings, bordered cards, compact metric grids and responsive action groups. The authenticated shell has no wallpaper background.

## UI Adapters and Form Controls

- `components/ui/form-controls.tsx` is a temporary bridge for remaining legacy call sites. New UI should import shadcn primitives directly; known size, spacing, tone and layout props must map to static utilities or inline styles and must not build Tailwind class names at runtime.
- `components/ui/searchable-select.tsx` composes Popover and Command for searchable options. The Settings timezone control uses this keyboard-operable combobox and persists a selection while updating immediately.
- Radix Select triggers are not native form controls. Forms that submit a Select value keep that value in React state and include it explicitly in the API payload instead of reading it from `FormData`.
- The legacy adapter no longer exports unused `Select`, `Drawer`, `NativeSelect`, `AlertBox`, `Code` or `Divider` wrappers. Remaining compatibility props are limited to active consumers and should be removed as those call sites move to native shadcn APIs.

## Theming

- `app/providers.tsx` owns the React Query client, dashboard `ThemeProvider`, and Sonner toaster.
- `lib/client/theme-tokens.ts` maps all 12 saved dashboard theme IDs to the shadcn CSS variable contract.
- `ThemeProvider` remains the dashboard settings context; `data-theme` and theme settings storage IDs are preserved.
- `app/globals.css` imports Tailwind CSS v4, Preflight, theme tokens and `tw-animate-css`.
- `components/domain/shared/MetricCard.tsx` and `MetricGrid.tsx` are the canonical metric-card contracts; numeric values are formatted inside the card. `ChartCard.tsx` is the canonical standalone chart container, with explicit title/description and padded plot body slots.
- Tailwind variables are the component token source; Radix provides accessible interaction behavior.

## Responsive Design

- Charts use responsive heights (140–200px mobile, 160–300px desktop)
- Grid layouts adapt from single column (mobile) to multi-column (desktop)
- Chart legends are rendered as plain HTML outside Recharts for better space control
- Touch targets meet WCAG 44px minimum (`min-h-11 min-w-11`)
- Safe-area-inset padding for notched devices
- `prefers-reduced-motion` disables non-essential animations
- Global `:focus-visible` outline for keyboard navigation

## Loading & Transitions

Multi-layered loading strategy for smooth UX on slow networks:

1. **Providers hydration guard** — a minimal background shell renders before the client shell mounts, preventing SSR/client mismatch
2. **Auth check** — non-blocking; the layout renders immediately
3. **Navigating overlay** — semi-transparent backdrop + spinner only while React Router reports a pending navigation
4. **Progress bar** — animated gradient bar at top of page only while navigation is pending
5. **Skeleton loading** — `MetricCardSkeleton` / `ChartCardSkeleton` replace "Loading…" text
6. **Fade-in animation** — `page-enter` class on route content for smooth appearance; disabled under `prefers-reduced-motion`

ASC connection details expose manual Sync Analytics and Sync Revenue alongside the existing Analytics setup and Edit Connection controls. Vendor Number setup uses Edit Connection rather than a separate wizard. Revenue supports enabled All Apps/single App, 7/30/90-day and Territory filters; Settlements use a separate Apple fiscal-month filter. Original currencies render separately, unknown metrics render `—`, Paying Users is not summed across rows, and subscription Active uses the latest per-app snapshot. Production charts read imported facts; no production report samples are requested by the UI. The browser converts decimal strings to chart coordinates only; monetary cards and tables preserve exact strings.
