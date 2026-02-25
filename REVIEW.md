# Code Review — Durable Support Agent

## Summary

Overall well-structured sample that demonstrates the Durable Functions human-in-the-loop pattern clearly. The findings below are organized by severity: bugs first, then best-practice improvements, then readability suggestions.

---

## Bugs / Correctness Issues

### 1. Orchestrator runs `issueRefund` for escalation cases

**File:** `functions/src/orchestrator.ts:28`

When a case is approved, the orchestrator always calls `issueRefund` — even for escalation cases that have no `refundAmount` or `orderId`. This is a logic error.

```ts
// Current: always calls issueRefund on approval
yield context.df.callActivity('issueRefund', { caseId });
```

**Fix:** Branch on the case's `action` type:

```ts
if (approved) {
  yield context.df.callActivity('updateCase', { caseId, status: 'approved' });

  // Only process refund for refund cases
  const caseData = yield context.df.callActivity('getCaseDetails', { caseId });
  if (caseData.action === 'refund') {
    yield context.df.callActivity('issueRefund', { caseId });
  }

  yield context.df.callActivity('updateCase', {
    caseId, status: 'completed',
    resolution: caseData.action === 'refund'
      ? 'Refund approved and processed by supervisor'
      : 'Escalation acknowledged by supervisor',
  });
  // ...
}
```

### 2. No timeout on `waitForExternalEvent`

**File:** `functions/src/orchestrator.ts:18`

If nobody ever approves or rejects a case, the orchestration waits indefinitely. Durable Functions supports a timeout via `createTimer` + `Task.any`.

**Suggestion:** Add a configurable timeout (e.g., 7 days) and auto-reject or notify on expiry.

---

## Best Practices

### 3. Cosmos client created on every function invocation

**File:** `functions/src/activities.ts:19-24`

`getCosmosContainer()` creates a new `CosmosClient` on every activity call. The Cosmos SDK is designed for singleton usage — it manages connection pooling internally, and creating new instances repeatedly wastes TCP connections and skips warm caches.

```ts
// Current: new client every call
function getCosmosContainer() {
  const client = new CosmosClient(connectionString);
  return client.database('support-agent').container('cases');
}
```

**Fix:** Initialize once at module scope:

```ts
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING!);
const container = client.database('support-agent').container('cases');
```

The same issue exists in the dashboard's API routes (`dashboard/src/app/api/cases/route.ts`, `approve/route.ts`, `reject/route.ts`), where each has its own `getContainer()` that instantiates a new client per request.

### 4. Hard-coded database and container names

The strings `'support-agent'` and `'cases'` appear in 5 separate files across 3 projects:

- `src/cosmos.ts:13-14`
- `functions/src/activities.ts:23`
- `dashboard/src/app/api/cases/route.ts:8`
- `dashboard/src/app/api/cases/[id]/approve/route.ts:8`
- `dashboard/src/app/api/cases/[id]/reject/route.ts:8`

**Suggestion:** Use environment variables or a shared constants file so a rename doesn't require editing 5 files.

### 5. Duplicated `getContainer()` function in dashboard

**Files:** `dashboard/src/app/api/cases/route.ts`, `approve/route.ts`, `reject/route.ts`

The same 5-line function is copied into all three route files. Extract to a shared `lib/cosmos.ts` module.

### 6. Missing input validation on Functions HTTP endpoints

**File:** `functions/src/index.ts:22`

`startOrchestration` casts `req.json()` to `{ caseId: string }` without validation. If `caseId` is missing, the orchestration starts with `undefined` as the instance ID.

```ts
const body = await req.json() as { caseId: string };
// body.caseId could be undefined — no runtime check
```

Similarly, `approveCase` and `rejectCase` don't verify the orchestration instance exists before calling `raiseEvent`, which would throw an opaque error.

### 7. `latest` tag in package.json dependencies

**File:** `package.json:19-27`

All `@microsoft/teams.*` packages use `"latest"`, which means `npm install` at different times will produce different builds. Pin to specific versions or at least use `^x.y.z` ranges for reproducible builds.

### 8. Inconsistent Cosmos SDK versions

Root `package.json` uses `@azure/cosmos: ^4.2.0`, dashboard uses `^4.9.1`. Not a bug (both resolve to compatible versions), but aligning them avoids confusion.

### 9. No shared `SupportCase` type across projects

The `SupportCase` interface in `src/types.ts` is the source of truth, but:
- `functions/src/activities.ts` defines its own partial interfaces (`UpdateCaseInput`, etc.)
- `dashboard/src/app/page.tsx` redefines a subset of the interface inline

If fields are added or renamed, these copies can drift. Consider a shared `types` package or at minimum a shared `.ts` file that all three projects import.

---

## Readability / Clarity

### 10. `getCasesByUser` is defined but never used

**File:** `src/cosmos.ts:47-58`

Dead code. Either remove it or add a tool that uses it (e.g., "show my recent cases").

### 11. Notification server body parsing is manual

**File:** `src/index.ts:64-91`

The raw `createServer` + manual body buffering works but is verbose and lacks safeguards (no content-length limit, no content-type check). Since this is a sample, consider adding a brief comment explaining why a raw HTTP server is used instead of Express, or simplify with a lightweight framework.

### 12. `UpdateCaseInput.status` uses `string` instead of union type

**File:** `functions/src/activities.ts:6`

```ts
interface UpdateCaseInput {
  caseId: string;
  status: string; // should be: 'pending_approval' | 'approved' | 'rejected' | 'completed'
}
```

Using the union type would catch typos at compile time.

### 13. Dashboard approve/reject routes are nearly identical

**Files:** `dashboard/src/app/api/cases/[id]/approve/route.ts` and `reject/route.ts`

These two 37-line files differ by only two strings (`approve`/`reject` and `approved`/`rejected`). Could be consolidated into a single `[id]/[action]/route.ts` dynamic route, or share a helper.

### 14. Orchestrator notification messages are hard-coded

**File:** `functions/src/orchestrator.ts:37-38, 50-51`

The user-facing notification messages are buried inside the orchestrator. Moving them to a constants file or template would make them easier to review and localize.

---

## Minor / Nit-picks

### 15. `console.log` with emoji in tools.ts

**File:** `src/tools.ts:151-152, 208`

The `console.log` statements with emoji are helpful for local dev but would be noise in production logs. Not an issue for a sample, just noting for production considerations.

### 16. Dashboard polling interval

**File:** `dashboard/src/app/page.tsx:37`

5-second polling is fine for a sample/demo. For production, consider server-sent events or WebSockets to reduce unnecessary requests and improve responsiveness.

---

## Recommended Priority

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 1 | Orchestrator runs refund for escalations | Small | High — bug |
| 3 | Cosmos client singleton | Small | Medium — perf |
| 5 | Extract shared `getContainer` in dashboard | Small | Medium — DRY |
| 6 | Input validation on Functions endpoints | Small | Medium — robustness |
| 7 | Pin dependency versions | Small | Medium — reproducibility |
| 9 | Shared types across projects | Medium | Medium — maintainability |
| 2 | Orchestration timeout | Medium | Low — edge case |
| 10 | Remove dead code | Trivial | Low — clarity |
| 12 | Use union type for status | Trivial | Low — type safety |
| 13 | Consolidate approve/reject routes | Small | Low — DRY |
