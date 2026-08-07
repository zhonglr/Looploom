# Canvas Hardening Progress

## Current stage
Stage 4 complete. All packages through Stage 4 done. Ready for Stage 5.

## Completed packages

| Package | Completed date | Commit | Human accepted |
|---|---|---|---|
| W01 | 2026-08-07 | (pending) | N/A (infra) |
| W02 | 2026-08-07 | (pending) | N/A |
| W03 | 2026-08-07 | (pending) | N/A |
| W04 | 2026-08-07 | (pending) | N/A |
| W07A | 2026-08-07 | (pending) | N/A |
| W09A | 2026-08-07 | (pending) | N/A |
| W05 | 2026-08-07 | (pending) | N/A |
| W07B | 2026-08-07 | (pending) | N/A |
| W06 | 2026-08-07 | (pending) | N/A |
| W10 | 2026-08-07 | (pending) | N/A |

## Blocked / in progress

| Package | Status | Blocked by / notes |
|---|---|---|
| W07C | Ready | W07B + W06 complete |
| W07D | Ready | W07B complete |

## Deferred CANs

| CAN | Reason | Re-trigger condition |
|---|---|---|
| CAN-021 | P3, current components don't use transform/overflow | Before shipping advanced component types |

## Decisions log

| Date | Decision | Context | Impact |
|---|---|---|---|
| 2026-08-07 | Vitest + Playwright | W01 | Unit in node env, browser via PW |
| 2026-08-07 | Vitest root pinned to app dir | W01 | Prevents monorepo-wide discovery |
| 2026-08-07 | Move fix: remove index adjustment | CAN-001 | targetIndex used directly as post-removal insert position |
| 2026-08-07 | Undo/redo: peek-first-apply-second | CAN-002 | History only modified after committed replay |
| 2026-08-07 | Subtree validation: traverse all incoming IDs | CAN-003 | Internal duplicates + cross-tree collisions rejected |
| 2026-08-07 | Protocol validation: dedicated module | CAN-005/CAN-009 | Both sides validate before acting |
| 2026-08-07 | Interaction reducer: pure function with injectable `now` | W07A | Deterministic, unit-testable transitions |
| 2026-08-07 | Overlay geometry: extracted to pure module | W09A | DragOverlay.tsx no longer has layout arithmetic |
| 2026-08-07 | Frame session: counter instead of boolean | CAN-008 | Each ready increments session, triggers recovery |
| 2026-08-07 | Recovery effect: only depends on frameSession | CAN-010 | No more duplicate sends on every channel change |
| 2026-08-07 | PointerSession: pure object owning capture lifecycle | CAN-012/CAN-013 | Drag + pan both capture; global cancel on blur/visibility |
| 2026-08-07 | ProjectionVersion: 4-field version in geometry reports | CAN-007 | Host rejects stale geometry from old viewport/interaction |
| 2026-08-07 | pageSize: divide screen by scale for world coords | CAN-011 | Fit is now idempotent |
| 2026-08-07 | Editing draft: Host-owned via interaction state | CAN-022 | Frame reload resends draft via recovery effect |
| 2026-08-07 | InlineEditor: Enter commits, Escape cancels, no newlines | CAN-023 | Consistent semantics for text + button |
| 2026-08-07 | Selection revision: compare on editCommit | CAN-024 | External selection change wins over async commit |
| 2026-08-07 | Drop feedback: disable position transitions while viewport moves | CAN-035 | Highlight tracks auto-pan exactly; easing kept for target switches |
