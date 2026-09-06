# Frontend Architecture

React Router 7 (Framework Mode) + React 19 + TypeScript + Mantine 9.6 + Tailwind CSS v4.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Router 7 (Framework Mode) + React 19 |
| UI components | Mantine 9.6 (`@mantine/core`, `@mantine/notifications`) |
| Styling | Mantine theme bridge + Tailwind CSS v4 layout utilities |
| Charts | Recharts |
| Icons | lucide-react |
| Data Fetching | @tanstack/react-query |
| i18n | react-i18next (JSON locale files, browser language detection) |
| Backend | React Router route handlers under `app/api/` (same process) |

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
│   ├── overview/       # Overview dashboard (Business Pulse + per-platform sections)
│   ├── accounts/       # Account management
│   ├── admin/          # User management (admin only)
│   ├── settings/       # App settings
│   ├── x/              # X account list + detail
│   ├── github/         # GitHub account list + detail + repo detail
│   ├── gitlab/         # GitLab account list + detail + project detail
│   └── reddit/         # Reddit account list + detail
├── login/page.tsx      # Login page
└── api/                # React Router route handlers (auth, accounts, fetchers, stats, …)
components/
├── Layout.tsx          # Sidebar + title bar + content shell (responsive)
├── AccountListPage.tsx # Reusable account list component
├── BrandIcons.tsx      # Platform brand icons
├── domain/shared/      # Canonical MetricCard, MetricGrid and data-display components
├── Skeleton.tsx        # Skeleton loading primitives
├── NavigationProgress.tsx # Top progress bar on route changes
├── NavigatingOverlay.tsx  # Full-screen spinner overlay during navigation
├── ThemeProvider.tsx   # Theme context provider
├── MockModeBanner.tsx  # MOCK MODE indicator when running on fixtures
└── ui/                 # Mantine-backed project wrappers and compatibility facades
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
| `/login` | Login page (redirects to `/` after successful login) |
| `/` | Redirects to `/overview` |
| `/overview` | Overview dashboard |
| `/accounts` | Account management |
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
| `/admin` | User management (admin only) |
| `/settings` | App settings |

## Auth Flow

1. Login form calls `api.login(username, password)`; the API sets an httpOnly JWT cookie.
2. On success the login page redirects to `/`.
3. `Layout` calls `api.checkAuth()` to resolve the current user and admin role; API requests automatically include the httpOnly cookie.
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

The main layout (`components/Layout.tsx`) provides:

- **Title bar** — 48px header with sidebar toggle button and dashboard title; safe-area-inset aware.
- **Sidebar** — CSS-based with smooth width/transform transitions (0.3s ease)
  - Desktop: push layout, sidebar slides in/out from left (state persisted to localStorage)
  - Mobile (<768px): overlay drawer with backdrop, hamburger menu in title bar; opens as a modal dialog (`role="dialog"`, `aria-modal`), closes on Esc/backdrop/nav click, and traps focus while open
- **Responsive detection** — `lib/client/useIsMobile.ts` for breakpoint-aware behavior

## Theming

- `app/providers.tsx` owns the single `MantineProvider` and `Notifications` mount.
- `lib/client/mantine-theme.ts` maps all 12 dashboard themes to typed tokens and ten-shade Mantine palettes.
- `ThemeProvider` remains the dashboard settings context; `data-theme` and legacy CSS variables remain as a migration bridge.
- `app/globals.css` imports Mantine's layered styles, Tailwind theme/utilities only, and intentionally omits Tailwind preflight.
- `components/domain/shared/MetricCard.tsx` and `MetricGrid.tsx` are the canonical metric-card contracts; numeric values are formatted inside the card. `ChartCard.tsx` is the canonical standalone chart container, with explicit title/description and padded plot body slots.
- Tailwind is retained for page layout and responsive utilities, not as the source of component tokens or interactive controls.

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
3. **Navigating overlay** — semi-transparent backdrop + spinner during route transitions
4. **Progress bar** — animated gradient bar at top of page on navigation
5. **Skeleton loading** — `MetricCardSkeleton` / `ChartCardSkeleton` replace "Loading…" text
6. **Fade-in animation** — `page-enter` class on route content for smooth appearance; disabled under `prefers-reduced-motion`
