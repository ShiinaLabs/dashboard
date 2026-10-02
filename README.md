# Dashboard

A self-hosted command center for developer activity and first-party web analytics.

Bring GitHub, GitLab, X, Reddit, and your own websites into one private dashboard. Run it with PostgreSQL on infrastructure you control.

## One place for activity and traffic

Follow updates from connected developer and social accounts alongside traffic from websites you operate. The overview brings activity, data freshness, and the busiest content into one place; each platform and site keeps its own detail page for deeper analysis.

First-party Web Analytics reports page views, visits, acquisition sources, and site-level dimensions from your own dashboard installation. It is designed for your own properties, rather than as a third-party advertising or audience-tracking service.

### Add a site to Web Analytics

1. Register a site in the Analytics page.
2. Add its tracker snippet to pages on that site.
3. Review portfolio traffic in Overview and open Analytics for site-level detail.

## Highlights

- One overview for activity across developer platforms
- First-party web analytics for sites you own
- App Store Connect team connections, app discovery and app selection
- 7, 30, and 90-day trends and acquisition summaries
- Fetch health with run history, stale-data, and failure visibility
- Multi-user access with owner-scoped data
- Self-hosted deployment backed by PostgreSQL

### Connect App Store Connect

Open **Connections** (`/accounts`), choose **App Store Connect**, and add a Team API Key using its `.p8` private key, Key ID and Issuer ID. Dashboard validates access and discovers apps before saving the connection. Enable the apps you want to sync; new apps start disabled. Vendor Number is optional and can be added later.

The connection foundation currently supports manual app metadata refresh and credential management. Analytics Reports, Revenue and automatic ASC scheduling are subsequent phases. ASC is an independent data source: there is no Product model or association with social accounts, repositories or Web Analytics sites. Mock mode provides a demonstration connection and rejects private key storage.

## Private by deployment

The dashboard runs as a Node.js application with its own PostgreSQL database. Account credentials are encrypted before storage, and multi-user access scopes dashboard data to its owner. You choose where it runs and who can sign in.

It is intended for personal use, households, and small trusted teams. The web app, scheduler, and platform fetchers run together in one application process; PostgreSQL stores account and analytics data.

## Quick Start

### Docker Compose

```bash
cp .env.example .env
# Set a unique DASHBOARD_SECRET in .env
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000). The first startup creates the initial administrator; set its password in Settings.

See [Configuration](docs/CONFIGURATION.md) for environment settings and [Deployment](docs/DEPLOYMENT.md) for production setup.

### Try the UI locally

```bash
pnpm install --frozen-lockfile
pnpm run mock
```

Mock mode serves fixture data and does not require PostgreSQL. See [Testing](docs/TESTING.md) for development and verification commands.

## Documentation

Start with the [Documentation Index](docs/README.md).

| Topic | Guide |
| --- | --- |
| Architecture and data flow | [Architecture](docs/ARCHITECTURE.md) |
| Configuration and deployment | [Configuration](docs/CONFIGURATION.md) · [Deployment](docs/DEPLOYMENT.md) |
| API and analytics queries | [API](docs/API.md) · [GraphQL](docs/GRAPHQL.md) |
| Development and operations | [Frontend](docs/FRONTEND.md) · [Database](docs/DATABASE.md) · [Fetchers](docs/FETCHERS.md) |
| Testing and scripts | [Testing](docs/TESTING.md) · [Scripts](docs/SCRIPTS.md) |
| Dependency licenses | [Dependencies](docs/DEPENDENCIES.md) |

## Project documentation policy

The docs index is the entry point for maintained setup, architecture, and operations guidance. It is kept short here so the detailed references have one canonical home.

Human-facing documentation lives in `docs/`. Agent plans, specs, research, and archives live in `.agents/`.

## Origins & License

Dashboard is derived from an MIT-licensed project by xiaoxiunique.

Current project modifications are distributed under Apache-2.0. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for original and third-party terms.
