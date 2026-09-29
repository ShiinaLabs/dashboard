# Dependency License Audit — September 2026

Internal maintainer inventory. This records installed package metadata and review actions; it is not legal advice or a compatibility opinion.

## Inventory Method

- Base: `f1913b8f3a1a63e318b3a48ddb46025f06eab54f` on `main`; pnpm `10.34.5`.
- Inventory commands: `pnpm licenses list --prod --json --long` and `pnpm licenses list -D --json --long`, after resolving the lockfile. The command reports installed resolved metadata; repository URLs come from the corresponding installed package manifests.
- Final production graph: 223 resolved package versions; final development graph: 254 resolved package versions. The development graph includes shared production packages and development-only transitive packages.
- The initial production inventory at the base contained `ua-parser-js@2.0.10`, declared `AGPL-3.0-or-later`. It was replaced with `ua-parser-js@1.0.41`, declared `MIT`, before final verification.
- A package is marked direct when its name appears in the root dependency manifest; remaining rows are transitive in the corresponding pnpm graph.

## Production Inventory

| Package | Resolved version | Dependency role | Declared license expression | Source / repository | Classification | Action required |
| --- | --- | --- | --- | --- | --- | --- |
| `@ai-sdk/gateway` | 4.0.62 | transitive | Apache-2.0 | <https://github.com/vercel/ai> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@ai-sdk/openai` | 4.0.46 | direct production | Apache-2.0 | <https://github.com/vercel/ai> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@ai-sdk/provider-utils` | 5.0.29 | transitive | Apache-2.0 | <https://github.com/vercel/ai> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@ai-sdk/provider` | 4.0.7 | transitive | Apache-2.0 | <https://github.com/vercel/ai> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/runtime` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@chenglou/pretext` | 0.0.8 | direct production | MIT | <https://github.com/chenglou/pretext.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@drizzle-team/brocli` | 0.10.2 | transitive | Apache-2.0 | <https://github.com/drizzle-team/brocli.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@envelop/core` | 5.6.1 | transitive | MIT | <https://github.com/graphql-hive/graphql-yoga.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@envelop/instrumentation` | 1.0.1 | transitive | MIT | <https://github.com/graphql-hive/graphql-yoga.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@envelop/types` | 5.2.2 | transitive | MIT | <https://github.com/graphql-hive/graphql-yoga.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@epic-web/invariant` | 1.0.0 | transitive | MIT | <https://github.com/epicweb-dev/invariant> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@esbuild-kit/core-utils` | 3.3.2 | transitive | MIT | `esbuild-kit/core-utils` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@esbuild-kit/esm-loader` | 2.6.5 | transitive | MIT | `esbuild-kit/esm-loader` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@esbuild/darwin-arm64` | 0.18.20 | transitive | MIT | <https://github.com/evanw/esbuild> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@esbuild/darwin-arm64` | 0.25.12 | transitive | MIT | <https://github.com/evanw/esbuild.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@esbuild/darwin-arm64` | 0.28.1 | transitive | MIT | <https://github.com/evanw/esbuild.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@fastify/busboy` | 3.2.2 | transitive | MIT | <https://github.com/fastify/busboy.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@floating-ui/core` | 1.8.0 | transitive | MIT | <https://github.com/floating-ui/floating-ui.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@floating-ui/dom` | 1.8.0 | transitive | MIT | <https://github.com/floating-ui/floating-ui.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@floating-ui/react-dom` | 2.1.9 | transitive | MIT | <https://github.com/floating-ui/floating-ui.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@floating-ui/utils` | 0.2.12 | transitive | MIT | <https://github.com/floating-ui/floating-ui.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@graphql-tools/executor` | 2.0.1 | transitive | MIT | <https://github.com/ardatan/graphql-tools.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@graphql-tools/merge` | 9.2.4 | transitive | MIT | <https://github.com/ardatan/graphql-tools.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@graphql-tools/schema` | 10.1.1 | transitive | MIT | <https://github.com/ardatan/graphql-tools.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@graphql-tools/utils` | 11.2.2 | transitive | MIT | `ardatan/graphql-tools` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@graphql-tools/utils` | 12.0.1 | transitive | MIT | <https://github.com/ardatan/graphql-tools.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@graphql-typed-document-node/core` | 3.2.0 | transitive | MIT | `git@github.com:dotansimha/graphql-typed-document-node.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@graphql-yoga/logger` | 2.0.2 | transitive | MIT | <https://github.com/graphql-hive/graphql-yoga.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@graphql-yoga/subscription` | 5.1.1 | transitive | MIT | <https://github.com/graphql-hive/graphql-yoga.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@graphql-yoga/typed-event-target` | 3.0.3 | transitive | MIT | <https://github.com/graphql-hive/graphql-yoga.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@mjackson/node-fetch-server` | 0.2.0 | transitive | MIT | <https://github.com/mjackson/remix-the-web.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@phc/format` | 1.0.0 | transitive | MIT | `github:simonepri/phc-format` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/number` | 1.1.3 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/primitive` | 1.1.7 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-alert-dialog` | 1.1.23 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-arrow` | 1.1.15 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-avatar` | 1.2.6 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-checkbox` | 1.3.11 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-collapsible` | 1.1.20 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-collection` | 1.1.15 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-compose-refs` | 1.1.5 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-context` | 1.2.2 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-dialog` | 1.1.23 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-direction` | 1.1.4 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-dismissable-layer` | 1.1.19 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-dropdown-menu` | 2.1.24 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-focus-guards` | 1.1.6 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-focus-scope` | 1.1.16 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-id` | 1.1.4 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-label` | 2.1.15 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-menu` | 2.1.24 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-popover` | 1.1.23 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-popper` | 1.3.7 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-portal` | 1.1.17 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-presence` | 1.1.10 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-primitive` | 2.1.10 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-roving-focus` | 1.1.19 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-scroll-area` | 1.2.18 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-select` | 2.3.7 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-separator` | 1.1.15 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-slot` | 1.3.3 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-switch` | 1.3.7 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-tabs` | 1.1.21 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-tooltip` | 1.2.16 | direct production | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-use-callback-ref` | 1.1.4 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-use-controllable-state` | 1.2.6 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-use-effect-event` | 0.0.5 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-use-is-hydrated` | 0.1.3 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-use-layout-effect` | 1.1.4 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-use-previous` | 1.1.4 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-use-rect` | 1.1.4 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-use-size` | 1.1.4 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/react-visually-hidden` | 1.2.11 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@radix-ui/rect` | 1.1.3 | transitive | MIT | <https://github.com/radix-ui/primitives.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@react-router/node` | 7.18.2 | direct production | MIT | <https://github.com/remix-run/react-router> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@reduxjs/toolkit` | 2.12.0 | transitive | MIT | <https://github.com/reduxjs/redux-toolkit.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@repeaterjs/repeater` | 3.1.0 | transitive | MIT | <https://github.com/repeaterjs/repeater.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@standard-schema/spec` | 1.1.0 | transitive | MIT | <https://github.com/standard-schema/standard-schema> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@standard-schema/utils` | 0.3.0 | transitive | MIT | <https://github.com/standard-schema/standard-schema> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@tanstack/query-core` | 5.101.2 | transitive | MIT | <https://github.com/TanStack/query.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@tanstack/react-query` | 5.101.2 | direct production | MIT | <https://github.com/TanStack/query.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/d3-array` | 3.2.2 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/d3-color` | 3.1.3 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/d3-ease` | 3.0.2 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/d3-interpolate` | 3.0.4 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/d3-path` | 3.1.1 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/d3-scale` | 4.0.9 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/d3-shape` | 3.1.8 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/d3-time` | 3.0.4 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/d3-timer` | 3.0.2 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/node` | 26.1.0 | direct development | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/pg` | 8.20.0 | direct development | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/react-dom` | 19.2.3 | direct development | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/react` | 19.2.17 | direct development | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/use-sync-external-store` | 0.0.6 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@vercel/oidc` | 3.2.0 | transitive | Apache-2.0 | <https://github.com/vercel/vercel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@whatwg-node/disposablestack` | 0.0.6 | transitive | MIT | `ardatan/whatwg-node` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@whatwg-node/events` | 0.1.2 | transitive | MIT | `ardatan/whatwg-node` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@whatwg-node/fetch` | 0.10.13 | transitive | MIT | `ardatan/whatwg-node` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@whatwg-node/node-fetch` | 0.8.6 | transitive | MIT | `ardatan/whatwg-node` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@whatwg-node/promise-helpers` | 1.3.2 | transitive | MIT | `ardatan/whatwg-node` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@whatwg-node/server` | 0.11.0 | transitive | MIT | `ardatan/whatwg-node` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@workflow/serde` | 4.1.0 | transitive | Apache-2.0 | <https://github.com/vercel/workflow.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `ai` | 7.0.77 | direct production | Apache-2.0 | <https://github.com/vercel/ai> | Known permissive | No project-specific source notice; retain package-provided license. |
| `argon2` | 0.44.0 | direct production | MIT | <https://github.com/ranisalt/node-argon2.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `aria-hidden` | 1.2.6 | transitive | MIT | <https://github.com/theKashey/aria-hidden.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `boolbase` | 1.0.0 | transitive | ISC | <https://github.com/fb55/boolbase> | Known permissive | No project-specific source notice; retain package-provided license. |
| `buffer-from` | 1.1.2 | transitive | MIT | `LinusU/buffer-from` | Known permissive | No project-specific source notice; retain package-provided license. |
| `class-variance-authority` | 0.7.1 | direct production | Apache-2.0 | <https://github.com/joe-bell/cva.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `clsx` | 2.1.1 | direct production | MIT | `lukeed/clsx` | Known permissive | No project-specific source notice; retain package-provided license. |
| `cmdk` | 1.1.1 | direct production | MIT | <https://github.com/pacocoursey/cmdk.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `cookie` | 1.1.1 | transitive | MIT | `jshttp/cookie` | Known permissive | No project-specific source notice; retain package-provided license. |
| `cross-env` | 10.1.0 | transitive | MIT | <https://github.com/kentcdodds/cross-env.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `cross-inspect` | 1.0.1 | transitive | MIT | `ardatan/graphql-tools` | Known permissive | No project-specific source notice; retain package-provided license. |
| `cross-spawn` | 7.0.6 | transitive | MIT | `git@github.com:moxystudio/node-cross-spawn.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `css-select` | 5.2.2 | transitive | BSD-2-Clause | `git://github.com/fb55/css-select.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `css-what` | 6.2.2 | transitive | BSD-2-Clause | <https://github.com/fb55/css-what> | Known permissive | No project-specific source notice; retain package-provided license. |
| `csstype` | 3.2.3 | transitive | MIT | <https://github.com/frenic/csstype> | Known permissive | No project-specific source notice; retain package-provided license. |
| `d3-array` | 3.2.4 | transitive | ISC | <https://github.com/d3/d3-array.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `d3-color` | 3.1.0 | transitive | ISC | <https://github.com/d3/d3-color.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `d3-ease` | 3.0.1 | transitive | BSD-3-Clause | <https://github.com/d3/d3-ease.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `d3-format` | 3.1.2 | transitive | ISC | <https://github.com/d3/d3-format.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `d3-interpolate` | 3.0.1 | transitive | ISC | <https://github.com/d3/d3-interpolate.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `d3-path` | 3.1.0 | transitive | ISC | <https://github.com/d3/d3-path.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `d3-scale` | 4.0.2 | transitive | ISC | <https://github.com/d3/d3-scale.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `d3-shape` | 3.2.0 | transitive | ISC | <https://github.com/d3/d3-shape.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `d3-time-format` | 4.1.0 | transitive | ISC | <https://github.com/d3/d3-time-format.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `d3-time` | 3.1.0 | transitive | ISC | <https://github.com/d3/d3-time.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `d3-timer` | 3.0.1 | transitive | ISC | <https://github.com/d3/d3-timer.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `decimal.js-light` | 2.5.1 | transitive | MIT | <https://github.com/MikeMcl/decimal.js-light.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `detect-node-es` | 1.1.0 | transitive | MIT | <https://github.com/thekashey/detect-node> | Known permissive | No project-specific source notice; retain package-provided license. |
| `dom-serializer` | 2.0.0 | transitive | MIT | `git://github.com/cheeriojs/dom-serializer.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `domelementtype` | 2.3.0 | transitive | BSD-2-Clause | `git://github.com/fb55/domelementtype.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `domhandler` | 5.0.3 | transitive | BSD-2-Clause | `git://github.com/fb55/domhandler.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `domutils` | 3.2.2 | transitive | BSD-2-Clause | `git://github.com/fb55/domutils.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `drizzle-kit` | 0.31.10 | direct production | MIT | <https://github.com/drizzle-team/drizzle-orm.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `drizzle-orm` | 0.45.2 | direct production | Apache-2.0 | <https://github.com/drizzle-team/drizzle-orm.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `entities` | 4.5.0 | transitive | BSD-2-Clause | `git://github.com/fb55/entities.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `es-toolkit` | 1.49.0 | transitive | MIT | <https://github.com/toss/es-toolkit.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `esbuild` | 0.18.20 | transitive | MIT | <https://github.com/evanw/esbuild> | Known permissive | No project-specific source notice; retain package-provided license. |
| `esbuild` | 0.25.12 | transitive | MIT | <https://github.com/evanw/esbuild.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `esbuild` | 0.28.1 | transitive | MIT | <https://github.com/evanw/esbuild.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `eventemitter3` | 5.0.4 | transitive | MIT | `git://github.com/primus/eventemitter3.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `eventsource-parser` | 3.1.1 | transitive | MIT | `ssh://git@github.com/rexxars/eventsource-parser.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `fsevents` | 2.3.3 | transitive | MIT | <https://github.com/fsevents/fsevents.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `get-nonce` | 1.0.1 | transitive | MIT | `git@github.com:theKashey/get-nonce.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `get-tsconfig` | 4.14.0 | transitive | MIT | `privatenumber/get-tsconfig` | Known permissive | No project-specific source notice; retain package-provided license. |
| `graphql-yoga` | 5.24.1 | direct production | MIT | <https://github.com/graphql-hive/graphql-yoga.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `graphql` | 17.0.2 | direct production | MIT | <https://github.com/graphql/graphql-js.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `he` | 1.2.0 | transitive | MIT | <https://github.com/mathiasbynens/he.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `html-parse-stringify` | 3.0.1 | transitive | MIT | <https://github.com/henrikjoreteg/html-parse-stringify> | Known permissive | No project-specific source notice; retain package-provided license. |
| `i18next-browser-languagedetector` | 8.2.1 | direct production | MIT | <https://github.com/i18next/i18next-browser-languageDetector.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `i18next` | 26.3.4 | direct production | MIT | <https://github.com/i18next/i18next.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `immer` | 11.1.11 | transitive | MIT | <https://github.com/immerjs/immer.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `internmap` | 2.0.3 | transitive | ISC | <https://github.com/mbostock/internmap.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `isbot` | 5.2.1 | direct production | Unlicense | <https://github.com/omrilotan/isbot.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `isexe` | 2.0.0 | transitive | ISC | <https://github.com/isaacs/isexe.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `jose` | 6.2.3 | direct production | MIT | `panva/jose` | Known permissive | No project-specific source notice; retain package-provided license. |
| `json-schema` | 0.4.0 | transitive | (AFL-2.1 OR BSD-3-Clause) | <http://github.com/kriszyp/json-schema> | RECOGNIZED OPTION — AFL-2.1 OR BSD-3-Clause | Package license offers BSD-3-Clause; checker accepts only this recognized branch. |
| `lodash` | 4.18.1 | direct production | MIT | `lodash/lodash` | Known permissive | No project-specific source notice; retain package-provided license. |
| `lru-cache` | 10.4.3 | transitive | ISC | `git://github.com/isaacs/node-lru-cache.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `lucide-react` | 1.23.0 | direct production | ISC | <https://github.com/lucide-icons/lucide.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `node-addon-api` | 8.9.0 | transitive | MIT | `git://github.com/nodejs/node-addon-api.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `node-gyp-build` | 4.8.4 | transitive | MIT | <https://github.com/prebuild/node-gyp-build.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `node-html-parser` | 7.1.0 | transitive | MIT | <https://github.com/taoqf/node-fast-html-parser.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `nth-check` | 2.1.1 | transitive | BSD-2-Clause | <https://github.com/fb55/nth-check> | Known permissive | No project-specific source notice; retain package-provided license. |
| `path-key` | 3.1.1 | transitive | MIT | `sindresorhus/path-key` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pg-cloudflare` | 1.4.0 | transitive | MIT | `git://github.com/brianc/node-postgres.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pg-connection-string` | 2.14.0 | transitive | MIT | `git://github.com/brianc/node-postgres.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pg-int8` | 1.0.1 | transitive | ISC | <https://github.com/charmander/pg-int8> | Known permissive | No project-specific source notice; retain package-provided license. |
| `pg-pool` | 3.14.0 | transitive | MIT | `git://github.com/brianc/node-postgres.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pg-protocol` | 1.15.0 | transitive | MIT | `git://github.com/brianc/node-postgres.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pg-types` | 2.2.0 | transitive | MIT | `git://github.com/brianc/node-pg-types.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pg` | 8.21.0 | direct production | MIT | `git://github.com/brianc/node-postgres.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pgpass` | 1.0.5 | transitive | MIT | <https://github.com/hoegaarden/pgpass.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `postgres-array` | 2.0.0 | transitive | MIT | `bendrucker/postgres-array` | Known permissive | No project-specific source notice; retain package-provided license. |
| `postgres-bytea` | 1.0.1 | transitive | MIT | `bendrucker/postgres-bytea` | Known permissive | No project-specific source notice; retain package-provided license. |
| `postgres-date` | 1.0.7 | transitive | MIT | `bendrucker/postgres-date` | Known permissive | No project-specific source notice; retain package-provided license. |
| `postgres-interval` | 1.2.0 | transitive | MIT | `bendrucker/postgres-interval` | Known permissive | No project-specific source notice; retain package-provided license. |
| `react-dom` | 19.2.7 | direct production | MIT | <https://github.com/facebook/react.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `react-i18next` | 17.0.8 | direct production | MIT | <https://github.com/i18next/react-i18next.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `react-is` | 19.2.7 | transitive | MIT | <https://github.com/facebook/react.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `react-redux` | 9.3.0 | transitive | MIT | `github:reduxjs/react-redux` | Known permissive | No project-specific source notice; retain package-provided license. |
| `react-remove-scroll-bar` | 2.3.8 | transitive | MIT | <https://github.com/theKashey/react-remove-scroll-bar> | Known permissive | No project-specific source notice; retain package-provided license. |
| `react-remove-scroll` | 2.7.2 | transitive | MIT | <https://github.com/theKashey/react-remove-scroll> | Known permissive | No project-specific source notice; retain package-provided license. |
| `react-router` | 7.18.2 | direct production | MIT | <https://github.com/remix-run/react-router> | Known permissive | No project-specific source notice; retain package-provided license. |
| `react-style-singleton` | 2.2.3 | transitive | MIT | <https://github.com/theKashey/react-style-singleton> | Known permissive | No project-specific source notice; retain package-provided license. |
| `react` | 19.2.7 | direct production | MIT | <https://github.com/facebook/react.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `recharts` | 3.9.2 | direct production | MIT | <https://github.com/recharts/recharts.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `redux-thunk` | 3.1.0 | transitive | MIT | `github:reduxjs/redux-thunk` | Known permissive | No project-specific source notice; retain package-provided license. |
| `redux` | 5.0.1 | transitive | MIT | `github:reduxjs/redux` | Known permissive | No project-specific source notice; retain package-provided license. |
| `reselect` | 5.2.0 | transitive | MIT | <https://github.com/reduxjs/reselect.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `resolve-pkg-maps` | 1.0.0 | transitive | MIT | `privatenumber/resolve-pkg-maps` | Known permissive | No project-specific source notice; retain package-provided license. |
| `scheduler` | 0.27.0 | transitive | MIT | <https://github.com/facebook/react.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `set-cookie-parser` | 2.7.2 | transitive | MIT | `nfriedly/set-cookie-parser` | Known permissive | No project-specific source notice; retain package-provided license. |
| `shebang-command` | 2.0.0 | transitive | MIT | `kevva/shebang-command` | Known permissive | No project-specific source notice; retain package-provided license. |
| `shebang-regex` | 3.0.0 | transitive | MIT | `sindresorhus/shebang-regex` | Known permissive | No project-specific source notice; retain package-provided license. |
| `sonner` | 2.0.8 | direct production | MIT | <https://github.com/emilkowalski/sonner.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `source-map-support` | 0.5.21 | transitive | MIT | <https://github.com/evanw/node-source-map-support> | Known permissive | No project-specific source notice; retain package-provided license. |
| `source-map` | 0.6.1 | transitive | BSD-3-Clause | <http://github.com/mozilla/source-map.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `split2` | 4.2.0 | transitive | ISC | <https://github.com/mcollina/split2.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `tailwind-merge` | 3.6.0 | direct production | MIT | <https://github.com/dcastil/tailwind-merge.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `tiny-invariant` | 1.3.3 | transitive | MIT | <https://github.com/alexreardon/tiny-invariant.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `tslib` | 2.8.1 | transitive | 0BSD | <https://github.com/Microsoft/tslib.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `tsx` | 4.23.0 | direct production | MIT | `privatenumber/tsx` | Known permissive | No project-specific source notice; retain package-provided license. |
| `tw-animate-css` | 1.4.0 | direct production | MIT | `Wombosvideo/tw-animate-css` | Known permissive | No project-specific source notice; retain package-provided license. |
| `twitter-api-v2` | 1.29.0 | direct production | Apache-2.0 | `github:plhery/node-twitter-api-v2` | Known permissive | No project-specific source notice; retain package-provided license. |
| `twitter-openapi-typescript-generated` | 0.0.40 | transitive | custom license or AGPL-3.0-or-later | <https://github.com/fa0311/twitter-openapi-typescript.git> | REVIEWED EXCEPTION — selected Custom License; AGPL option not selected | Retain exact notice/restriction; checker pins package, version, and expression. |
| `twitter-openapi-typescript` | 0.0.56 | direct production | custom license or AGPL-3.0-or-later | <https://github.com/fa0311/twitter-openapi-typescript.git> | REVIEWED EXCEPTION — selected Custom License; AGPL option not selected | Retain exact notice/restriction; checker pins package, version, and expression. |
| `typescript` | 5.9.3 | transitive | Apache-2.0 | <https://github.com/microsoft/TypeScript.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `ua-parser-js` | 1.0.41 | direct production | MIT | <https://github.com/faisalman/ua-parser-js.git> | Known permissive — MIT | Replaces AGPL-3.0-or-later v2; collector normalization is regression-tested. |
| `undici-types` | 8.3.0 | transitive | MIT | <https://github.com/nodejs/undici.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `undici` | 7.29.0 | transitive | MIT | <https://github.com/nodejs/undici.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `urlpattern-polyfill` | 10.1.0 | transitive | MIT | <https://github.com/kenchris/urlpattern-polyfill> | Known permissive | No project-specific source notice; retain package-provided license. |
| `use-callback-ref` | 1.3.3 | transitive | MIT | <https://github.com/theKashey/use-callback-ref/> | Known permissive | No project-specific source notice; retain package-provided license. |
| `use-sidecar` | 1.1.3 | transitive | MIT | <https://github.com/theKashey/use-sidecar> | Known permissive | No project-specific source notice; retain package-provided license. |
| `use-sync-external-store` | 1.6.0 | transitive | MIT | <https://github.com/facebook/react.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `victory-vendor` | 37.3.6 | transitive | MIT AND ISC | <https://github.com/FormidableLabs/victory> | Known permissive — all declared AND terms are recognized | No project-specific source notice; retain package-provided license. |
| `void-elements` | 3.1.0 | transitive | MIT | `pugjs/void-elements` | Known permissive | No project-specific source notice; retain package-provided license. |
| `which` | 2.0.2 | transitive | ISC | `git://github.com/isaacs/node-which.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `x-client-transaction-id-generater` | 0.0.7 | transitive | MIT | not declared | Known permissive | No project-specific source notice; retain package-provided license. |
| `xtend` | 4.0.2 | transitive | MIT | `git://github.com/Raynos/xtend.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `zod` | 4.4.3 | direct production | MIT | <https://github.com/colinhacks/zod.git> | Known permissive | No project-specific source notice; retain package-provided license. |

## Development Dependency Inventory

Development dependency license metadata is listed separately. Non-allowlisted licenses are labeled for review and are not evaluated by the production-only `pnpm license:check`.

| Package | Resolved version | Dependency role | Declared license expression | Source / repository | Classification | Action required |
| --- | --- | --- | --- | --- | --- | --- |
| `@alloc/quick-lru` | 5.2.0 | transitive | MIT | `sindresorhus/quick-lru` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/code-frame` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/compat-data` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/core` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/generator` | 7.29.8 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-annotate-as-pure` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-compilation-targets` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-create-class-features-plugin` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-globals` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-member-expression-to-functions` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-module-imports` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-module-transforms` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-optimise-call-expression` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-plugin-utils` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-replace-supers` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-skip-transparent-expression-wrappers` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-string-parser` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-validator-identifier` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helper-validator-option` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/helpers` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/parser` | 7.29.8 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/plugin-syntax-jsx` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/plugin-syntax-typescript` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/plugin-transform-modules-commonjs` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/plugin-transform-typescript` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/preset-typescript` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/template` | 7.29.7 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/traverse` | 7.29.8 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@babel/types` | 7.29.8 | transitive | MIT | <https://github.com/babel/babel.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@eslint-community/eslint-utils` | 4.9.1 | transitive | MIT | <https://github.com/eslint-community/eslint-utils> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@eslint-community/regexpp` | 4.12.2 | transitive | MIT | <https://github.com/eslint-community/regexpp> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@eslint/config-array` | 0.21.2 | transitive | Apache-2.0 | <https://github.com/eslint/rewrite.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@eslint/config-helpers` | 0.4.2 | transitive | Apache-2.0 | <https://github.com/eslint/rewrite.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@eslint/core` | 0.17.0 | transitive | Apache-2.0 | <https://github.com/eslint/rewrite.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@eslint/eslintrc` | 3.3.6 | transitive | MIT | `eslint/eslintrc` | Known permissive | No project-specific source notice; retain package-provided license. |
| `@eslint/js` | 9.39.5 | direct development | MIT | <https://github.com/eslint/eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@eslint/object-schema` | 2.1.7 | transitive | Apache-2.0 | <https://github.com/eslint/rewrite.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@eslint/plugin-kit` | 0.4.1 | transitive | Apache-2.0 | <https://github.com/eslint/rewrite.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@humanfs/core` | 0.19.2 | transitive | Apache-2.0 | <https://github.com/humanwhocodes/humanfs.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@humanfs/node` | 0.16.8 | transitive | Apache-2.0 | <https://github.com/humanwhocodes/humanfs.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@humanfs/types` | 0.15.0 | transitive | Apache-2.0 | <https://github.com/humanwhocodes/humanfs.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@humanwhocodes/module-importer` | 1.0.1 | transitive | Apache-2.0 | <https://github.com/humanwhocodes/module-importer.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@humanwhocodes/retry` | 0.4.3 | transitive | Apache-2.0 | <https://github.com/humanwhocodes/retry.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@jridgewell/gen-mapping` | 0.3.13 | transitive | MIT | <https://github.com/jridgewell/sourcemaps.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@jridgewell/remapping` | 2.3.5 | transitive | MIT | <https://github.com/jridgewell/sourcemaps.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@jridgewell/resolve-uri` | 3.1.2 | transitive | MIT | <https://github.com/jridgewell/resolve-uri> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@jridgewell/sourcemap-codec` | 1.5.5 | transitive | MIT | <https://github.com/jridgewell/sourcemaps.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@jridgewell/trace-mapping` | 0.3.31 | transitive | MIT | <https://github.com/jridgewell/sourcemaps.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@mjackson/node-fetch-server` | 0.2.0 | transitive | MIT | <https://github.com/mjackson/remix-the-web.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@playwright/test` | 1.63.0 | direct development | Apache-2.0 | <https://github.com/microsoft/playwright.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@react-router/dev` | 7.18.2 | direct development | MIT | <https://github.com/remix-run/react-router> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@react-router/node` | 7.18.2 | direct production | MIT | <https://github.com/remix-run/react-router> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@remix-run/node-fetch-server` | 0.13.3 | transitive | MIT | <https://github.com/remix-run/remix.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@standard-schema/spec` | 1.1.0 | transitive | MIT | <https://github.com/standard-schema/standard-schema> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@tailwindcss/node` | 4.3.2 | transitive | MIT | <https://github.com/tailwindlabs/tailwindcss.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@tailwindcss/node` | 4.3.3 | transitive | MIT | <https://github.com/tailwindlabs/tailwindcss.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@tailwindcss/oxide` | 4.3.2 | transitive | MIT | <https://github.com/tailwindlabs/tailwindcss.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@tailwindcss/oxide` | 4.3.3 | transitive | MIT | <https://github.com/tailwindlabs/tailwindcss.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@tailwindcss/postcss` | 4.3.2 | direct development | MIT | <https://github.com/tailwindlabs/tailwindcss.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@tailwindcss/vite` | 4.3.3 | direct development | MIT | <https://github.com/tailwindlabs/tailwindcss.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/chai` | 5.2.3 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/deep-eql` | 4.0.2 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/estree` | 1.0.9 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/json-schema` | 7.0.15 | transitive | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/lodash` | 4.17.24 | direct development | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/node` | 26.1.0 | direct development | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/pg` | 8.20.0 | direct development | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/react-dom` | 19.2.3 | direct development | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@types/react` | 19.2.17 | direct development | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@typescript-eslint/eslint-plugin` | 8.62.1 | transitive | MIT | <https://github.com/typescript-eslint/typescript-eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@typescript-eslint/parser` | 8.62.1 | transitive | MIT | <https://github.com/typescript-eslint/typescript-eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@typescript-eslint/project-service` | 8.62.1 | transitive | MIT | <https://github.com/typescript-eslint/typescript-eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@typescript-eslint/scope-manager` | 8.62.1 | transitive | MIT | <https://github.com/typescript-eslint/typescript-eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@typescript-eslint/tsconfig-utils` | 8.62.1 | transitive | MIT | <https://github.com/typescript-eslint/typescript-eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@typescript-eslint/type-utils` | 8.62.1 | transitive | MIT | <https://github.com/typescript-eslint/typescript-eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@typescript-eslint/types` | 8.62.1 | transitive | MIT | <https://github.com/typescript-eslint/typescript-eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@typescript-eslint/typescript-estree` | 8.62.1 | transitive | MIT | <https://github.com/typescript-eslint/typescript-eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@typescript-eslint/utils` | 8.62.1 | transitive | MIT | <https://github.com/typescript-eslint/typescript-eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@typescript-eslint/visitor-keys` | 8.62.1 | transitive | MIT | <https://github.com/typescript-eslint/typescript-eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@vitest/expect` | 4.1.9 | transitive | MIT | <https://github.com/vitest-dev/vitest.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@vitest/mocker` | 4.1.9 | transitive | MIT | <https://github.com/vitest-dev/vitest.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@vitest/pretty-format` | 4.1.9 | transitive | MIT | <https://github.com/vitest-dev/vitest.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@vitest/runner` | 4.1.9 | transitive | MIT | <https://github.com/vitest-dev/vitest.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@vitest/snapshot` | 4.1.9 | transitive | MIT | <https://github.com/vitest-dev/vitest.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@vitest/spy` | 4.1.9 | transitive | MIT | <https://github.com/vitest-dev/vitest.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `@vitest/utils` | 4.1.9 | transitive | MIT | <https://github.com/vitest-dev/vitest.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `acorn-jsx` | 5.3.2 | transitive | MIT | <https://github.com/acornjs/acorn-jsx> | Known permissive | No project-specific source notice; retain package-provided license. |
| `acorn` | 8.17.0 | transitive | MIT | <https://github.com/acornjs/acorn.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `ajv` | 6.15.0 | transitive | MIT | <https://github.com/ajv-validator/ajv.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `ansi-styles` | 4.3.0 | transitive | MIT | `chalk/ansi-styles` | Known permissive | No project-specific source notice; retain package-provided license. |
| `arg` | 5.0.2 | transitive | MIT | `vercel/arg` | Known permissive | No project-specific source notice; retain package-provided license. |
| `argparse` | 2.0.1 | transitive | Python-2.0 | `nodeca/argparse` | REVIEW REQUIRED — development graph license outside allowlist | Do not treat as cleared; review before moving into production scope. |
| `assertion-error` | 2.0.1 | transitive | MIT | `git@github.com:chaijs/assertion-error.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `babel-dead-code-elimination` | 1.0.12 | transitive | MIT | `pcattori/babel-dead-code-elimination` | Known permissive | No project-specific source notice; retain package-provided license. |
| `balanced-match` | 1.0.2 | transitive | MIT | `git://github.com/juliangruber/balanced-match.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `balanced-match` | 4.0.4 | transitive | MIT | `git://github.com/juliangruber/balanced-match.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `baseline-browser-mapping` | 2.11.12 | transitive | Apache-2.0 | <https://github.com/web-platform-dx/baseline-browser-mapping.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `brace-expansion` | 1.1.18 | transitive | MIT | `git://github.com/juliangruber/brace-expansion.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `brace-expansion` | 5.0.7 | transitive | MIT | <https://github.com/juliangruber/brace-expansion.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `browserslist` | 4.28.7 | transitive | MIT | `browserslist/browserslist` | Known permissive | No project-specific source notice; retain package-provided license. |
| `cac` | 6.7.14 | transitive | MIT | `egoist/cac` | Known permissive | No project-specific source notice; retain package-provided license. |
| `callsites` | 3.1.0 | transitive | MIT | `sindresorhus/callsites` | Known permissive | No project-specific source notice; retain package-provided license. |
| `caniuse-lite` | 1.0.30001806 | transitive | CC-BY-4.0 | `browserslist/caniuse-lite` | REVIEW REQUIRED — development graph license outside allowlist | Do not treat as cleared; review before moving into production scope. |
| `chai` | 6.2.2 | transitive | MIT | <https://github.com/chaijs/chai> | Known permissive | No project-specific source notice; retain package-provided license. |
| `chalk` | 4.1.2 | transitive | MIT | `chalk/chalk` | Known permissive | No project-specific source notice; retain package-provided license. |
| `chokidar` | 4.0.3 | transitive | MIT | <https://github.com/paulmillr/chokidar.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `color-convert` | 2.0.1 | transitive | MIT | `Qix-/color-convert` | Known permissive | No project-specific source notice; retain package-provided license. |
| `color-name` | 1.1.4 | transitive | MIT | `git@github.com:colorjs/color-name.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `concat-map` | 0.0.1 | transitive | MIT | `git://github.com/substack/node-concat-map.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `confbox` | 0.2.4 | transitive | MIT | `unjs/confbox` | Known permissive | No project-specific source notice; retain package-provided license. |
| `convert-source-map` | 2.0.0 | transitive | MIT | `git://github.com/thlorenz/convert-source-map.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `cookie` | 1.1.1 | transitive | MIT | `jshttp/cookie` | Known permissive | No project-specific source notice; retain package-provided license. |
| `cross-spawn` | 7.0.6 | transitive | MIT | `git@github.com:moxystudio/node-cross-spawn.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `csstype` | 3.2.3 | transitive | MIT | <https://github.com/frenic/csstype> | Known permissive | No project-specific source notice; retain package-provided license. |
| `debug` | 4.4.3 | transitive | MIT | `git://github.com/debug-js/debug.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `dedent` | 1.7.2 | transitive | MIT | <https://github.com/dmnd/dedent> | Known permissive | No project-specific source notice; retain package-provided license. |
| `deep-is` | 0.1.4 | transitive | MIT | <http://github.com/thlorenz/deep-is.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `detect-libc` | 2.1.2 | transitive | Apache-2.0 | `git://github.com/lovell/detect-libc.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `electron-to-chromium` | 1.5.394 | transitive | ISC | <https://github.com/Kilian/electron-to-chromium.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `enhanced-resolve` | 5.21.6 | transitive | MIT | `git://github.com/webpack/enhanced-resolve.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `enhanced-resolve` | 5.24.5 | transitive | MIT | <https://github.com/webpack/enhanced-resolve.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `es-module-lexer` | 1.7.0 | transitive | MIT | <https://github.com/guybedford/es-module-lexer.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `es-module-lexer` | 2.3.0 | transitive | MIT | <https://github.com/guybedford/es-module-lexer.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `esbuild` | 0.28.1 | transitive | MIT | <https://github.com/evanw/esbuild.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `escalade` | 3.2.0 | transitive | MIT | `lukeed/escalade` | Known permissive | No project-specific source notice; retain package-provided license. |
| `escape-string-regexp` | 4.0.0 | transitive | MIT | `sindresorhus/escape-string-regexp` | Known permissive | No project-specific source notice; retain package-provided license. |
| `eslint-plugin-react-hooks` | 6.1.1 | direct development | MIT | <https://github.com/facebook/react.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `eslint-scope` | 8.4.0 | transitive | BSD-2-Clause | <https://github.com/eslint/js.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `eslint-visitor-keys` | 3.4.3 | transitive | Apache-2.0 | `eslint/eslint-visitor-keys` | Known permissive | No project-specific source notice; retain package-provided license. |
| `eslint-visitor-keys` | 4.2.1 | transitive | Apache-2.0 | <https://github.com/eslint/js.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `eslint-visitor-keys` | 5.0.1 | transitive | Apache-2.0 | <https://github.com/eslint/js.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `eslint` | 9.39.5 | direct development | MIT | `eslint/eslint` | Known permissive | No project-specific source notice; retain package-provided license. |
| `espree` | 10.4.0 | transitive | BSD-2-Clause | <https://github.com/eslint/js.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `esquery` | 1.7.0 | transitive | BSD-3-Clause | <https://github.com/estools/esquery.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `esrecurse` | 4.3.0 | transitive | BSD-2-Clause | <https://github.com/estools/esrecurse.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `estraverse` | 5.3.0 | transitive | BSD-2-Clause | <http://github.com/estools/estraverse.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `estree-walker` | 3.0.3 | transitive | MIT | <https://github.com/Rich-Harris/estree-walker> | Known permissive | No project-specific source notice; retain package-provided license. |
| `esutils` | 2.0.3 | transitive | BSD-2-Clause | <http://github.com/estools/esutils.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `exit-hook` | 2.2.1 | transitive | MIT | `sindresorhus/exit-hook` | Known permissive | No project-specific source notice; retain package-provided license. |
| `expect-type` | 1.4.0 | transitive | Apache-2.0 | <https://github.com/mmkal/expect-type.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `exsolve` | 1.1.1 | transitive | MIT | `unjs/exsolve` | Known permissive | No project-specific source notice; retain package-provided license. |
| `fast-deep-equal` | 3.1.3 | transitive | MIT | <https://github.com/epoberezkin/fast-deep-equal.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `fast-json-stable-stringify` | 2.1.0 | transitive | MIT | `git://github.com/epoberezkin/fast-json-stable-stringify.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `fast-levenshtein` | 2.0.6 | transitive | MIT | <https://github.com/hiddentao/fast-levenshtein.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `fdir` | 6.5.0 | transitive | MIT | <https://github.com/thecodrr/fdir.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `file-entry-cache` | 8.0.0 | transitive | MIT | `jaredwray/file-entry-cache` | Known permissive | No project-specific source notice; retain package-provided license. |
| `find-up` | 5.0.0 | transitive | MIT | `sindresorhus/find-up` | Known permissive | No project-specific source notice; retain package-provided license. |
| `flat-cache` | 4.0.1 | transitive | MIT | `jaredwray/flat-cache` | Known permissive | No project-specific source notice; retain package-provided license. |
| `flatted` | 3.4.2 | transitive | ISC | <https://github.com/WebReflection/flatted.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `gensync` | 1.0.0-beta.2 | transitive | MIT | <https://github.com/loganfsmyth/gensync.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `glob-parent` | 6.0.2 | transitive | ISC | `gulpjs/glob-parent` | Known permissive | No project-specific source notice; retain package-provided license. |
| `globals` | 14.0.0 | transitive | MIT | `sindresorhus/globals` | Known permissive | No project-specific source notice; retain package-provided license. |
| `graceful-fs` | 4.2.11 | transitive | ISC | <https://github.com/isaacs/node-graceful-fs> | Known permissive | No project-specific source notice; retain package-provided license. |
| `has-flag` | 4.0.0 | transitive | MIT | `sindresorhus/has-flag` | Known permissive | No project-specific source notice; retain package-provided license. |
| `ignore` | 5.3.2 | transitive | MIT | `git@github.com:kaelzhang/node-ignore.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `ignore` | 7.0.5 | transitive | MIT | `git@github.com:kaelzhang/node-ignore.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `import-fresh` | 3.3.1 | transitive | MIT | `sindresorhus/import-fresh` | Known permissive | No project-specific source notice; retain package-provided license. |
| `imurmurhash` | 0.1.4 | transitive | MIT | <https://github.com/jensyt/imurmurhash-js> | Known permissive | No project-specific source notice; retain package-provided license. |
| `is-extglob` | 2.1.1 | transitive | MIT | `jonschlinkert/is-extglob` | Known permissive | No project-specific source notice; retain package-provided license. |
| `is-glob` | 4.0.3 | transitive | MIT | `micromatch/is-glob` | Known permissive | No project-specific source notice; retain package-provided license. |
| `isbot` | 5.2.1 | direct production | Unlicense | <https://github.com/omrilotan/isbot.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `isexe` | 2.0.0 | transitive | ISC | <https://github.com/isaacs/isexe.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `jiti` | 2.7.0 | transitive | MIT | `unjs/jiti` | Known permissive | No project-specific source notice; retain package-provided license. |
| `js-tokens` | 4.0.0 | transitive | MIT | `lydell/js-tokens` | Known permissive | No project-specific source notice; retain package-provided license. |
| `js-yaml` | 4.3.1 | transitive | MIT | `nodeca/js-yaml` | Known permissive | No project-specific source notice; retain package-provided license. |
| `jsesc` | 3.0.2 | transitive | MIT | <https://github.com/mathiasbynens/jsesc.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `jsesc` | 3.1.0 | transitive | MIT | <https://github.com/mathiasbynens/jsesc.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `json-buffer` | 3.0.1 | transitive | MIT | `git://github.com/dominictarr/json-buffer.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `json-schema-traverse` | 0.4.1 | transitive | MIT | <https://github.com/epoberezkin/json-schema-traverse.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `json-stable-stringify-without-jsonify` | 1.0.1 | transitive | MIT | `git://github.com/samn/json-stable-stringify.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `json5` | 2.2.3 | transitive | MIT | <https://github.com/json5/json5.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `keyv` | 4.5.4 | transitive | MIT | <https://github.com/jaredwray/keyv.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `levn` | 0.4.1 | transitive | MIT | `git://github.com/gkz/levn.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `lightningcss` | 1.32.0 | transitive | MPL-2.0 | <https://github.com/parcel-bundler/lightningcss.git> | REVIEW REQUIRED — development graph license outside allowlist | Do not treat as cleared; review before moving into production scope. |
| `locate-path` | 6.0.0 | transitive | MIT | `sindresorhus/locate-path` | Known permissive | No project-specific source notice; retain package-provided license. |
| `lodash.merge` | 4.6.2 | transitive | MIT | `lodash/lodash` | Known permissive | No project-specific source notice; retain package-provided license. |
| `lodash` | 4.18.1 | direct production | MIT | `lodash/lodash` | Known permissive | No project-specific source notice; retain package-provided license. |
| `lru-cache` | 5.1.1 | transitive | ISC | `git://github.com/isaacs/node-lru-cache.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `magic-string` | 0.30.21 | transitive | MIT | <https://github.com/Rich-Harris/magic-string.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `minimatch` | 10.2.5 | transitive | BlueOak-1.0.0 | `git@github.com:isaacs/minimatch` | REVIEW REQUIRED — development graph license outside allowlist | Do not treat as cleared; review before moving into production scope. |
| `minimatch` | 3.1.5 | transitive | ISC | `git://github.com/isaacs/minimatch.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `ms` | 2.1.3 | transitive | MIT | `vercel/ms` | Known permissive | No project-specific source notice; retain package-provided license. |
| `nanoid` | 3.3.15 | transitive | MIT | `ai/nanoid` | Known permissive | No project-specific source notice; retain package-provided license. |
| `natural-compare` | 1.4.0 | transitive | MIT | `git://github.com/litejs/natural-compare-lite.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `node-releases` | 2.0.52 | transitive | MIT | <https://github.com/chicoxyzzy/node-releases.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `obug` | 2.1.3 | transitive | MIT | <https://github.com/sxzz/obug.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `optionator` | 0.9.4 | transitive | MIT | `git://github.com/gkz/optionator.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `p-limit` | 3.1.0 | transitive | MIT | `sindresorhus/p-limit` | Known permissive | No project-specific source notice; retain package-provided license. |
| `p-locate` | 5.0.0 | transitive | MIT | `sindresorhus/p-locate` | Known permissive | No project-specific source notice; retain package-provided license. |
| `p-map` | 7.0.6 | transitive | MIT | `sindresorhus/p-map` | Known permissive | No project-specific source notice; retain package-provided license. |
| `parent-module` | 1.0.1 | transitive | MIT | `sindresorhus/parent-module` | Known permissive | No project-specific source notice; retain package-provided license. |
| `path-exists` | 4.0.0 | transitive | MIT | `sindresorhus/path-exists` | Known permissive | No project-specific source notice; retain package-provided license. |
| `path-key` | 3.1.1 | transitive | MIT | `sindresorhus/path-key` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pathe` | 1.1.2 | transitive | MIT | `unjs/pathe` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pathe` | 2.0.3 | transitive | MIT | `unjs/pathe` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pg-int8` | 1.0.1 | transitive | ISC | <https://github.com/charmander/pg-int8> | Known permissive | No project-specific source notice; retain package-provided license. |
| `pg-protocol` | 1.15.0 | transitive | MIT | `git://github.com/brianc/node-postgres.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pg-types` | 2.2.0 | transitive | MIT | `git://github.com/brianc/node-pg-types.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `picocolors` | 1.1.1 | transitive | ISC | `alexeyraspopov/picocolors` | Known permissive | No project-specific source notice; retain package-provided license. |
| `picomatch` | 4.0.5 | transitive | MIT | `micromatch/picomatch` | Known permissive | No project-specific source notice; retain package-provided license. |
| `pkg-types` | 2.3.1 | transitive | MIT | `unjs/pkg-types` | Known permissive | No project-specific source notice; retain package-provided license. |
| `playwright-core` | 1.63.0 | transitive | Apache-2.0 | <https://github.com/microsoft/playwright.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `playwright` | 1.63.0 | transitive | Apache-2.0 | <https://github.com/microsoft/playwright.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `postcss` | 8.5.16 | transitive | MIT | `postcss/postcss` | Known permissive | No project-specific source notice; retain package-provided license. |
| `postgres-array` | 2.0.0 | transitive | MIT | `bendrucker/postgres-array` | Known permissive | No project-specific source notice; retain package-provided license. |
| `postgres-bytea` | 1.0.1 | transitive | MIT | `bendrucker/postgres-bytea` | Known permissive | No project-specific source notice; retain package-provided license. |
| `postgres-date` | 1.0.7 | transitive | MIT | `bendrucker/postgres-date` | Known permissive | No project-specific source notice; retain package-provided license. |
| `postgres-interval` | 1.2.0 | transitive | MIT | `bendrucker/postgres-interval` | Known permissive | No project-specific source notice; retain package-provided license. |
| `prelude-ls` | 1.2.1 | transitive | MIT | `git://github.com/gkz/prelude-ls.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `prettier` | 3.9.6 | transitive | MIT | `prettier/prettier` | Known permissive | No project-specific source notice; retain package-provided license. |
| `punycode` | 2.3.1 | transitive | MIT | <https://github.com/mathiasbynens/punycode.js.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `react-refresh` | 0.14.2 | transitive | MIT | <https://github.com/facebook/react.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `react-router` | 7.18.2 | direct production | MIT | <https://github.com/remix-run/react-router> | Known permissive | No project-specific source notice; retain package-provided license. |
| `react` | 19.2.7 | direct production | MIT | <https://github.com/facebook/react.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `readdirp` | 4.1.2 | transitive | MIT | `git://github.com/paulmillr/readdirp.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `resolve-from` | 4.0.0 | transitive | MIT | `sindresorhus/resolve-from` | Known permissive | No project-specific source notice; retain package-provided license. |
| `rollup` | 4.62.4 | transitive | MIT | <https://github.com/rollup/rollup.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `semver` | 6.3.1 | transitive | ISC | <https://github.com/npm/node-semver.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `semver` | 7.8.5 | transitive | ISC | <https://github.com/npm/node-semver.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `set-cookie-parser` | 2.7.2 | transitive | MIT | `nfriedly/set-cookie-parser` | Known permissive | No project-specific source notice; retain package-provided license. |
| `shebang-command` | 2.0.0 | transitive | MIT | `kevva/shebang-command` | Known permissive | No project-specific source notice; retain package-provided license. |
| `shebang-regex` | 3.0.0 | transitive | MIT | `sindresorhus/shebang-regex` | Known permissive | No project-specific source notice; retain package-provided license. |
| `siginfo` | 2.0.0 | transitive | ISC | <https://github.com/emilbayes/siginfo.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `source-map-js` | 1.2.1 | transitive | BSD-3-Clause | `7rulnik/source-map-js` | Known permissive | No project-specific source notice; retain package-provided license. |
| `stackback` | 0.0.2 | transitive | MIT | `git://github.com/shtylman/node-stackback.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `std-env` | 4.1.0 | transitive | MIT | `unjs/std-env` | Known permissive | No project-specific source notice; retain package-provided license. |
| `strip-json-comments` | 3.1.1 | transitive | MIT | `sindresorhus/strip-json-comments` | Known permissive | No project-specific source notice; retain package-provided license. |
| `supports-color` | 7.2.0 | transitive | MIT | `chalk/supports-color` | Known permissive | No project-specific source notice; retain package-provided license. |
| `tailwindcss` | 4.3.2 | direct development | MIT | <https://github.com/tailwindlabs/tailwindcss.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `tailwindcss` | 4.3.3 | direct development | MIT | <https://github.com/tailwindlabs/tailwindcss.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `tapable` | 2.3.3 | transitive | MIT | <http://github.com/webpack/tapable.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `tinybench` | 2.9.0 | transitive | MIT | `tinylibs/tinybench` | Known permissive | No project-specific source notice; retain package-provided license. |
| `tinyexec` | 1.2.4 | transitive | MIT | <https://github.com/tinylibs/tinyexec.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `tinyglobby` | 0.2.17 | transitive | MIT | <https://github.com/SuperchupuDev/tinyglobby.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `tinyrainbow` | 3.1.0 | transitive | MIT | <https://github.com/tinylibs/tinyrainbow.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `ts-api-utils` | 2.5.0 | transitive | MIT | <https://github.com/JoshuaKGoldberg/ts-api-utils> | Known permissive | No project-specific source notice; retain package-provided license. |
| `type-check` | 0.4.0 | transitive | MIT | `git://github.com/gkz/type-check.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `typescript-eslint` | 8.62.1 | direct development | MIT | <https://github.com/typescript-eslint/typescript-eslint.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `typescript` | 5.9.3 | transitive | Apache-2.0 | <https://github.com/microsoft/TypeScript.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `undici-types` | 8.3.0 | transitive | MIT | <https://github.com/nodejs/undici.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `update-browserslist-db` | 1.2.3 | transitive | MIT | `browserslist/update-db` | Known permissive | No project-specific source notice; retain package-provided license. |
| `uri-js` | 4.4.1 | transitive | BSD-2-Clause | <http://github.com/garycourt/uri-js> | Known permissive | No project-specific source notice; retain package-provided license. |
| `valibot` | 1.4.2 | transitive | MIT | <https://github.com/open-circle/valibot> | Known permissive | No project-specific source notice; retain package-provided license. |
| `vite-node` | 3.2.4 | transitive | MIT | <https://github.com/vitest-dev/vitest.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `vite` | 7.3.6 | direct development | MIT | <https://github.com/vitejs/vite.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `vitest` | 4.1.9 | direct development | MIT | <https://github.com/vitest-dev/vitest.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `which` | 2.0.2 | transitive | ISC | `git://github.com/isaacs/node-which.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `why-is-node-running` | 2.3.0 | transitive | MIT | <https://github.com/mafintosh/why-is-node-running.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `word-wrap` | 1.2.5 | transitive | MIT | `jonschlinkert/word-wrap` | Known permissive | No project-specific source notice; retain package-provided license. |
| `xtend` | 4.0.2 | transitive | MIT | `git://github.com/Raynos/xtend.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `yallist` | 3.1.1 | transitive | ISC | <https://github.com/isaacs/yallist.git> | Known permissive | No project-specific source notice; retain package-provided license. |
| `yocto-queue` | 0.1.0 | transitive | MIT | `sindresorhus/yocto-queue` | Known permissive | No project-specific source notice; retain package-provided license. |
| `zod-validation-error` | 4.0.2 | transitive | MIT | `git://github.com/causaly/zod-validation-error.git` | Known permissive | No project-specific source notice; retain package-provided license. |
| `zod` | 4.4.3 | direct production | MIT | <https://github.com/colinhacks/zod.git> | Known permissive | No project-specific source notice; retain package-provided license. |

## Findings and Actions

- `ua-parser-js@2.0.10` was removed from the production graph because its installed metadata declared `AGPL-3.0-or-later`. Upstream states 1.0.x remains MIT; `1.0.41` exposes the collector’s required constructor and `getResult()` fields. Version 1.0.41 does not bundle TypeScript declarations, so a narrow local declaration covers only the consumed browser/OS/device fields. Desktop, mobile, and unknown UA normalization has collector regression coverage.
- `twitter-openapi-typescript@0.0.56` (direct) and `twitter-openapi-typescript-generated@0.0.40` (transitive) both declare `custom license or AGPL-3.0-or-later`. The project explicitly selects the installed Custom License option and retains its exact notice and behavioral restriction in `THIRD_PARTY_NOTICES.md`; both resolved license files match the upstream repository files reviewed for this audit. They are not represented as MIT.
- `json-schema@0.4.0` declares `(AFL-2.1 OR BSD-3-Clause)`. Its installed license text states recipients may choose either. The checker only accepts its listed `BSD-3-Clause` option, which is on the project’s recognized identifier list; it does not allow AFL-2.1 on its own.
- The dev-only inventory flags `argparse@2.0.1` (Python-2.0), `caniuse-lite@1.0.30001806` (CC-BY-4.0), `lightningcss@1.32.0` (MPL-2.0), and `minimatch@10.2.5` (BlueOak-1.0.0) for maintainer review. They remain development-only.

## Source and Provenance Review

- `twitter-openapi-typescript` upstream project: https://github.com/fa0311/twitter-openapi-typescript. Its installed v0.0.56 Custom License text matches the upstream `twitter-openapi-typescript/LICENSE`; generated package v0.0.40 carries the same license text and metadata.
- `ua-parser-js` repository: https://github.com/faisalman/ua-parser-js. Upstream’s v1 documentation and license-change notice state that 1.0.x remains MIT, while 2.x is AGPL.
- The root `LICENSE` and existing shadcn-admin / Natural Earth notices were inspected and retained. The UI migration commit and donor instructions show the current `components/ui` primitives were adapted through the pinned shadcn-admin donor; no separate direct shadcn/ui source import was identified.
- Git history and old README/package metadata contained no explicit xiaoxiunique upstream URL, so README origins do not guess one.
