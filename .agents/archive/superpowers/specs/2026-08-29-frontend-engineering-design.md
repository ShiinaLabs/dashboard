# Frontend Engineering Design — Dashboard

> **Branch:** `codex/backend-rearch` (frontend share) · **Date:** 2026-08-29 · **Scope:** 前端全量规范化（P0→P3）· **Business only:** 你只写 `domain/` 业务

## 1. 背景与目标

前端存在“说不出来哪不好”的工程债堆叠：`eslint/prettier` 宽松、`any` 与 `@ts-nocheck` 残留、`lib/api.ts` 单文件 250 行与 `useOverviewData` `useQueries` 风暴耦合、`components/` 平铺无域、`Storybook` 缺失、首屏 `pulse` 无 ETag。目标：一次性 P0→P3 全量，使“只处理业务”成立——`domain/` 业务与 `ui/infra` 工程物理隔离。

**成功标准：** `pnpm lint --max-warnings=0` 零警告，`tsc --strict` 零 `any`，`overview` 首屏合并后 PG 连接减半且 `304` <15ms，`Storybook` 3 卡片可视，`playwright` 冒烟通过。

## 2. 代码规范 (P0, 0.5d)

* ESLint: `eslint.config.mjs` 启用 `strict` + `react-hooks` + `import` 排序，CI `eslint --max-warnings=0`
* Prettier: `prettier --check` + `lint-staged` 仅改暂存区，`husky pre-commit` 自动 fix
* TS: `tsconfig.json strict: true` + `noUncheckedIndexedAccess: true`，清 `lib/pulse` 等 `any`，`@ts-nocheck` 仅 `db/` 遗留
* Imports: 统一 `@/` 别名，强制 `builtin → external → internal → @/ → relative` 顺序

## 3. 架构工程 (P1, 1d)

* API: `lib/api.ts` 拆 `lib/api/{pulse,github,gitlab,reddit,accounts}.ts` + `lib/api/queryKeys.ts` 常量
* 数据获取: `useOverviewData` 收敛为 `queryOptions` 工厂（`createPulseQuery(days)`），新增 500ms 请求合并层（`accountIds` 合并为 `ANY`），与后端 `ETag` 对齐 `staleTime 3min`
* 路由: `loader` 仅 `withAuth + defer`，组件纯渲染，无 waterfall

## 4. 组件工程 (P2, 1d)

* `components/ui/` 纯 shadcn 原子，不含业务
* `components/domain/{pulse,github,gitlab,reddit}/` 业务卡片，`StatCard` 收敛为 `ui/Card` 变体，Props 统一 `title/value/description`
* Storybook 仅覆盖 `domain/` 3 核心卡片（Pulse/GitHub/GitLab），`ui/` 自动覆盖

> 你不需管 Storybook 配置、tailwind 变量、lucide 封装

## 5. 交付工程 (P3, 0.5d)

* 单测: `vitest + Testing Library` 为 `domain/` 补 1 个 `PulseSection` 渲染单测
* 冒烟: `playwright` 1 条 `overview` 首屏（`/` → `overview` 302 + ETag）
* 构建: `vite` 限内存保留，`pnpm` 加 `engines: node ^20` 锁定

## 6. 目录

```
lib/api/{pulse,github,gitlab,reddit,accounts}.ts + queryKeys.ts
lib/api/queryOptions.ts
components/ui/* (shadcn)
components/domain/{pulse,github,gitlab,reddit}/*
stories/domain/*
tests/domain/*
```

## 7. Non-goals

不改后端，不引入新状态库，不改 `Recharts` 选型。
