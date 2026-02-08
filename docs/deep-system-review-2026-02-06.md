# Deep System Review — Findings & Test Plan (No Fixes)

Date: 2026-02-06
Scope: end-to-end code review, workflow tracing, static checks, and executable tests.

## Workflow trace summary

1. **File-change propagation path**
   - `chokidar` in `/api/files/watch` emits SSE events.
   - `useFileEvents` subscribes via `EventSource`, logs activity, dispatches `clawpad:file-change`, and schedules workspace refreshes.
   - `PageEditor` listens to `clawpad:file-change` and refetches the open document.

2. **Search path**
   - `/api/files/search` delegates to `searchPages`.
   - `searchPages` computes score from title/content/tags and (currently) recency.

3. **Responsive/UI path**
   - `WorkspaceLayout` switches between desktop/tablet/mobile render trees from `useResponsive`.
   - Sidebar and chat components mount/unmount frequently as breakpoints change.

## Findings

### 1) Critical relevance bug: search can return non-matching pages
- In `searchPages`, recency bonus is added even if title/content/tags do not match query. This can produce false positives for gibberish queries.
- This was confirmed by the smoke suite (`No results for gibberish query` failed).

**Impact:** user-visible bad search quality; likely root cause for “UI shows wrong data after refresh/search interactions.”

### 2) SSE watcher lifecycle leak risk in `/api/files/watch`
- Route stores cleanup function by mutating the `controller` object, but `cancel()` reads from `this` (underlying source), so watcher cleanup is not reliably linked.
- If cleanup is skipped on disconnect/reconnect, chokidar watchers can accumulate.

**Impact:** memory/file-descriptor growth and duplicated change events over time; can manifest as jitter/repeat refreshes.

### 3) Per-client watcher fanout architecture gap
- `/api/files/watch` creates a fresh chokidar watcher for each SSE connection.
- This scales poorly with multiple tabs/devices and increases duplicate filesystem load.

**Impact:** avoidable CPU/IO overhead, duplicated events, and potential UI jitter under multi-client usage.

### 4) Multiple render-jitter anti-patterns flagged by lint (React hooks rules)
- Several components/hooks synchronously call `setState` in effects and mutate refs during render.
- These are explicitly flagged by React hook lint rules and correlate with mount flicker/cascading render risk.

**Impact:** visual jitter, hydration/mount flashes, unstable keyboard handling.

### 5) Gateway reconnection churn risk from repeated mount-driven connect flows
- `GatewayStatus` auto-runs `detect().then(connect())` on mount.
- Sidebar exists in different variants (desktop/sidebar sheet/mobile pages browser contexts), so repeated mounts can trigger repeated connect attempts.

**Impact:** transient connection-state flicker, extra network chatter, potentially noisy status UI.

### 6) Build reliability gap: hard dependency on remote font fetch during build
- Production build failed in this environment due to repeated fetch failures from `fonts.gstatic.com` for Geist fonts.

**Impact:** CI/deploy fragility in restricted/offline networks.

### 7) Quality-gate gap: no automated UI integration coverage for refresh synchronization
- Current repo checks catch some issues but there is no Playwright/e2e suite validating “external file change → sidebar/recent/editor state consistency after refresh”.

**Impact:** regressions in the exact user-reported area can ship undetected.

## High-priority test plan (do next, without changing product behavior)

1. **E2E: refresh consistency matrix**
   - Open page A in editor, mutate same file externally, ensure editor refresh behavior is correct for clean vs unsaved local state.
   - Validate sidebar recent list and space page counts update after `file-added`, `file-changed`, `file-removed`.
   - Repeat after hard browser refresh.

2. **E2E: breakpoint/mount churn**
   - Resize desktop↔tablet↔mobile repeatedly while chat/gateway connected.
   - Assert no duplicate websocket/session churn and no repeated event rows.

3. **API/Unit: search correctness contract**
   - Add deterministic tests that guarantee zero results for random/gibberish query, and that recency only breaks ties among actual matches.

4. **API/Integration: SSE lifecycle**
   - Connect/disconnect EventSource in loops and assert watcher count does not grow.
   - Validate no duplicate events after reconnect storms.

5. **Performance soak test**
   - Simulate rapid external writes (N files, M updates/sec) and verify UI remains responsive and event handling remains debounced.

## Suggested prioritization

- **P0:** search relevance false positives, SSE lifecycle leak risk.
- **P1:** render-jitter anti-pattern cleanup and gateway connect churn control.
- **P2:** per-client watcher architecture optimization and build-font resilience.
