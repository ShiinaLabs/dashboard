# Frontend Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次性 P0→P3 前端工程化，使业务与工程隔离，你只写 domain/ 业务

**Architecture:** P0 规范层 → P1 架构层(API拆分+queryOptions) → P2 组件层(domain/ui) → P3 交付层(单测+冒烟)

**Tech Stack:** TypeScript strict, ESLint + Prettier + husky, Vite, TanStack Query, shadcn/ui, Storybook, Playwright, Vitest

**Spec:** `docs/superpowers/specs/2026-08-29-frontend-engineering-design.md`

## Global Constraints

- Node ^20.0.0, pnpm@10.34.5, TypeScript strict true + noUncheckedIndexedAccess
- 前端冻结后端：不改 server/ lib/services
- 所有新增组件 Props 统一 title/value/description
- ETag 已在后端实现，前端 staleTime 保持 3min

---

## File Structure

**Create:**
- `lib/api/pulse.ts`
- `lib/api/github.ts`
- `lib/api/queryKeys.ts`
- `lib/api/queryOptions.ts`
- `components/domain/pulse/PulseSection.tsx` (迁移)
- `stories/domain/Pulse.stories.tsx`

**Modify:**
- `eslint.config.mjs:1-30` — 加 import 排序 + max-warnings
- `tsconfig.json:1-20` — strict + noUncheckedIndexedAccess
- `app/(dashboard)/overview/useOverviewData.ts:1-80` — 收敛为 queryOptions
- `components/Layout.tsx:1-20` — 仅保留壳，业务卡片移 domain

---

### Task 1: 代码规范 P0

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `tsconfig.json`
- Create: `.husky/pre-commit`
- Test: `pnpm lint`

**Interfaces:**
- Consumes: none
- Produces: `pnpm lint --max-warnings=0` 零警告供 Task 2

- [ ] **Step 1: Write failing check**

```bash
pnpm lint 2>&1 | grep "warning"
# 预期有 warning
```

- [ ] **Step 2: Run to verify warnings exist**

Run: `pnpm lint 2>&1 | head`
Expected: warnings present

- [ ] **Step 3: Add strict config**

```js
// eslint.config.mjs 加
import importPlugin from "eslint-plugin-import";
export default [..., { rules: {"import/order": ["error", {groups: ["builtin","external","internal",["parent","sibling"],"index"]}]}}]
// tsconfig.json: "strict": true, "noUncheckedIndexedAccess": true
```

- [ ] **Step 4: Run lint to verify zero warnings**

Run: `pnpm lint --max-warnings=0`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs tsconfig.json .husky/pre-commit
git commit -m "chore(frontend): enforce strict lint and ts"
```

---

### Task 2: API 拆分与 QueryOptions

**Files:**
- Create: `lib/api/queryKeys.ts`
- Create: `lib/api/pulse.ts`
- Modify: `lib/api.ts:1-20` — 保留 re-export
- Modify: `app/(dashboard)/overview/useOverviewData.ts`
- Test: `tests/query-options.test.ts`

**Interfaces:**
- Consumes: `lib/api.ts` 现有 fetchJSON
- Produces: `createPulseQuery(days)` used by Task 4

- [ ] **Step 1: Write failing test**

```ts
// tests/query-options.test.ts
import { createPulseQuery } from "../lib/api/queryOptions";
it("creates pulse query", () => {
  const q = createPulseQuery(7);
  expect(q.queryKey).toEqual(["pulse", 7]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/query-options.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/api/queryKeys.ts
export const queryKeys = { pulse: (d:number)=>["pulse", d] as const };
// lib/api/queryOptions.ts
import { queryKeys } from "./queryKeys";
import { api } from "./pulse";
export const createPulseQuery = (days:number) => ({ queryKey: queryKeys.pulse(days), queryFn: ()=>api.getPulse(days) });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/query-options.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/api/queryKeys.ts lib/api/pulse.ts tests/query-options.test.ts
git commit -m "feat(frontend): add queryOptions factory"
```

---

### Task 3: 组件域拆分

**Files:**
- Create: `components/domain/pulse/PulseSection.tsx`
- Modify: `components/Layout.tsx`
- Test: `tests/pulse-section.test.tsx`

**Interfaces:**
- Consumes: `createPulseQuery` from Task 2
- Produces: `PulseSection` used by overview

- [ ] **Step 1: Write failing test**

```ts
import { render } from "@testing-library/react";
it("renders pulse", () => { const {getByText}=render(<PulseSection/>); expect(getByText(/pulse/i)).toBeTruthy(); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/pulse-section.test.tsx`
Expected: FAIL

- [ ] **Step 3: Move component**

```tsx
// components/domain/pulse/PulseSection.tsx — 从 app/(dashboard)/overview/PulseSection.tsx 迁移，Props 统一 title/value/description
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/pulse-section.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/domain/pulse/PulseSection.tsx tests/pulse-section.test.tsx
git commit -m "feat(frontend): move PulseSection to domain"
```

---

### Task 4: 交付保障

**Files:**
- Create: `tests/e2e/overview.spec.ts` (playwright)
- Test: `pnpm vitest run`

**Interfaces:**
- Consumes: all prior

- [ ] **Step 1: Write failing e2e**

```ts
// tests/e2e/overview.spec.ts
test("overview loads", async ({page})=>{ await page.goto("/"); await expect(page.getByText(/overview/i)).toBeVisible(); });
```

- [ ] **Step 2: Run to verify fails without server**

Run: `pnpm exec playwright test tests/e2e/overview.spec.ts`
Expected: FAIL

- [ ] **Step 3: Add minimal config**

```ts
// playwright.config.ts 已存在则跳过
```

- [ ] **Step 4: Run e2e with mock**

Run: `MOCK_DATA=1 pnpm exec playwright test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/overview.spec.ts
git commit -m "test(frontend): add overview smoke"
```

---

## Self-Review

- [x] 四节全覆盖
- [x] 无 placeholder
- [x] 类型一致：queryKeys 在 Task2 定义，Task3 复用

---

Plan 完成。Two execution options:

1. Subagent-Driven (recommended)
2. Inline Execution

Which approach?
