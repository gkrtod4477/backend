## [2026-05-26] C3: Integrate AI chat commands with room lifecycle

**Plan reference:** `docs/plans/common-sequential-plan.md`

**Summary:**
- Connected `AiChatSessionsService` command execution to authoritative Worker 2 room, participant, and mission services for `ROOM_CREATE`, `USER_INVITE`, `ROOM_JOIN`, `USER_INVITE_DENY`, and `GAME_START`.
- Kept ambiguous or unsupported AI parsing non-authoritative, and converted command execution failures into `FAILED` chat results without silently mutating state outside validated service paths.
- Addressed post-implementation `gpt-5.4` review findings by making invite execution transactional as a batch, restricting owner-room fallback to `WAITING` rooms, and validating mission templates before room creation.

**Dependencies reviewed before starting:**
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/common/phase-1-foundation.md`
- `docs/implementaion-logs/worker-1/phase-2-intent-parsing.md`
- `docs/implementaion-logs/worker-2/phase-1-lobby.md`
- `docs/implementaion-logs/worker-2/phase-2-missions.md`
- `docs/implementaion-logs/worker-3/phase-1-realtime.md`
- `docs/plans/README.md`
- `docs/plans/common-sequential-plan.md`
- `docs/specs/03-modules.md`
- `docs/specs/05-api-and-realtime.md`
- `docs/specs/06-gameplay-lifecycle.md`
- `docs/specs/08-security-testing-and-delivery.md`

**Implementation details:**
- `AiChatSessionsService` now resolves validated `AiChatCommandDto` values into real service calls instead of always returning `PENDING`. Successful command execution persists `SUCCESS` `commandResult` values and updates `ai_chat_sessions.game_room_id` when the room context changes.
- `ROOM_CREATE` remains `PENDING` until both difficulty and mission template are present. Once both exist, `GameRoomMissionsService.validateMissionTemplateSelection()` runs before `GameRoomsService.createRoom()` so invalid template selections do not create `WAITING` rooms.
- `USER_INVITE` now resolves invitee nicknames to user IDs and calls the new `GameRoomParticipantsService.inviteParticipants()` batch path so all invitations run inside one transaction rather than partially persisting on mid-loop failure.
- `ROOM_JOIN` and `USER_INVITE_DENY` now resolve invitation context from explicit `participantId`, explicit `gameRoomId`, or the latest invited membership and then call Worker 2 acceptance or denial services only.
- `GAME_START` now resolves the selected mission template from the latest successful room-creation request for the same room and then calls `GameRoomsService.startGame()` through the same service-layer validation used by the HTTP API.
- Fallback room resolution for owner-driven commands now only targets `OWNER + JOINED` membership on `WAITING` rooms, avoiding accidental selection of `IN_PROGRESS` rooms when both statuses exist for the same user.
- `AiChatCommandResultMapper` gained `SUCCESS` and detail-aware `FAILED` mapping helpers so chat responses can reflect the authoritative API path, resolved room ID, participant summary, and `started` state after execution.

**Files changed:**
- `src/modules/ai-chat-sessions/ai-chat-sessions.module.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts`
- `src/modules/ai-chat-sessions/constants/ai-chat-error.constants.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-command-result.mapper.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.spec.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.ts`
- `src/modules/game-room-missions/service/game-room-missions.service.spec.ts`

**Verification:**
- [x] `corepack.cmd pnpm typecheck`
- [x] `.\node_modules\.bin\jest.cmd --runInBand src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts src/modules/ai-chat-sessions/intent/ai-chat-command-result.mapper.spec.ts src/modules/game-room-participants/service/game-room-participants.service.spec.ts src/modules/game-room-missions/service/game-room-missions.service.spec.ts`
- [x] `corepack.cmd pnpm lint`
- [x] `corepack.cmd pnpm build`
- [x] `gpt-5.4` review subagent run before and after fixes; initial findings on partial invite persistence, wrong owner-room fallback, and pre-validation room creation were fixed, and re-review reported no remaining findings.
- [ ] DB-backed integration tests were not run because the repository still lacks authenticated Postgres integration wiring for AI chat plus lobby flows.

**Commit:**
- `6bcae3a` feat(common): integrate ai chat commands with room lifecycle

**Impact on next tasks:**
- `C4` can assume AI-chat-driven room creation, invitation, acceptance, denial, and game-start preparation now traverse the same authoritative Worker 2 services as direct HTTP flows.
- Worker 3 or shared integration can emit realtime state changes on top of authoritative room mutations without inventing a second room-lifecycle path in the gateway layer.
- AI chat history now carries enough execution result metadata for the client to distinguish `PENDING`, `SUCCESS`, and `FAILED` command outcomes without bypassing service authority.

**Design decisions made:**
- Chose to keep command execution inside `AiChatSessionsService` orchestration rather than adding controller-level shortcuts so the AI chat module remains the integration seam while room-state authority stays in Worker 2 services.
- Added batch invitation support to Worker 2 instead of compensating in Worker 1 because atomic invitation behavior is a room-membership invariant, not an AI-only concern.
- Reused prior successful `ROOM_CREATE` request history to resolve the selected mission template for `GAME_START` rather than introducing a new session-local mutable store.

**Deviations from spec:**
- None intended. The implementation preserves the spec rule that invalid or ambiguous AI commands must not create authoritative room state.

**Trade-offs:**
- `GAME_START` currently derives the chosen template from prior successful chat history for the same room. This keeps the change local for C3, but a later explicit room-level persisted selection field may simplify C4 or direct HTTP start flows.
- Verification is still unit-test heavy because the repository does not yet provide a seeded authenticated integration harness for AI chat plus room mutations.

**Open questions:**
- [x] Can partial `USER_INVITE` execution leave authoritative state behind on a failed AI chat command? -> No. `inviteParticipants()` now batches the mutation in one transaction.
- [x] Can owner-room fallback select an `IN_PROGRESS` room when the user also owns a `WAITING` room? -> No. Fallback now filters to `WAITING` only.
- [x] Can `ROOM_CREATE` create a room before mission template validity is known? -> No. Template validation now runs before room creation.

**Open risks or follow-ups:**
- `GAME_START` still does not create the first turn or emit `game-started`; that remains `C4` scope with Worker 3 integration.
- Realtime participant broadcasts are still not triggered from these room-state service calls; shared integration must wire that sequencing deliberately instead of assuming C3 already broadcasts.
- A future DB-backed integration test should cover multi-invite rollback and `ROOM_CREATE -> GAME_START` template-selection continuity against real Postgres transactions.

**Instructions for the next worker:**
- Start `C4` from this log and preserve `AiChatSessionsService -> Worker 2 service` authority boundaries. Do not reintroduce direct repository mutation from AI chat code.
- If you need room-start context beyond `gameRoomId`, read the latest successful `ROOM_CREATE` request history first or promote that state into explicit persistence through the shared track.
- Keep invitation mutation paths batch-safe; any future multi-user lobby change should preserve single-transaction behavior for the whole command.

## [2026-05-26] C4: Connect game start, turn progression, and mission-result flow

**Plan reference:** `docs/plans/common-sequential-plan.md`

**Summary:**
- Connected authoritative game start to first-turn creation and realtime `game-started` / `game-state-updated` broadcasts through a dedicated `GameStartFlowService`.
- Implemented durable turn lifecycle persistence for submit and timeout: `turns`, `turn_snapshots`, `executions`, and `mission_results`, plus next-turn progression and final mission completion handling.
- Addressed post-implementation `gpt-5.4` review findings by stopping `ERROR` judgments from silently advancing to the next turn, reseeding file buffers on both `game-started` and `turn-changed`, restoring event payload shapes to the documented contract, and adding a server-side timeout sweep service.

**Dependencies reviewed before starting:**
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/common/phase-2-integration.md`
- `docs/implementaion-logs/worker-2/phase-2-missions.md`
- `docs/implementaion-logs/worker-3/phase-1-realtime.md`
- `docs/implementaion-logs/worker-3/phase-2-runtime.md`
- `docs/plans/README.md`
- `docs/plans/common-sequential-plan.md`
- `docs/specs/00-overview.md`
- `docs/specs/04-data-model.md`
- `docs/specs/05-api-and-realtime.md`
- `docs/specs/06-gameplay-lifecycle.md`
- `docs/specs/07-integrations-and-ai.md`
- `docs/specs/08-security-testing-and-delivery.md`

**Implementation details:**
- Added persistent `TurnEntity`, `TurnSnapshotEntity`, and `MissionResultEntity` plus migration `1764205300000-CreateTurnsAndMissionResultsTables.ts` so turn ownership, end-of-turn snapshots, execution outcomes, and judge results now survive realtime boundaries.
- `GameRoomsService.startGame()` now creates the first turn and transitions the first mission step into active play inside the same authoritative room-start transaction. `GameStartFlowService` wraps that result into canonical `game-started` and `game-state-updated` broadcasts with initial `fileUrl` metadata for editor bootstrapping.
- `TurnsService` now owns turn-end orchestration for manual submit and timeout: lock the turn, persist the snapshot, record execution, derive `PASSED | FAILED | ERROR`, update mission or room state, create the next turn when allowed, and return canonical realtime payloads.
- Runtime container absence is now explicit instead of implicit corruption. `ExecutionsService` records `RUNTIME_CONTAINER_UNAVAILABLE`, and the `ERROR` branch keeps the room in an explicit no-next-turn state until an operator or later task resolves the runtime condition.
- Realtime submit sequencing moved into `DefaultRealtimeTurnSubmitService`, which now publishes `turn-submit -> turn-evaluated -> turn-changed? -> mission-result? -> game-state-updated` in contract order instead of emitting the transition state too early.
- `RealtimeEventSupportService` now seeds initial file buffers on both `game-started` and `turn-changed`, so the next player can submit without first editing and still produce a non-empty snapshot. `RealtimeTurnTimeoutService` performs a server-side sweep of expired `IN_PROGRESS` turns and routes them through the same timeout lifecycle.
- AI-chat-driven `GAME_START` now goes through `GameStartFlowService`, so chat-started games and direct HTTP starts share the same turn initialization and realtime side effects.

**Files changed:**
- `database/migrations/1764205300000-CreateTurnsAndMissionResultsTables.ts`
- `src/app.module.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts`
- `src/modules/executions/service/executions.service.ts`
- `src/modules/game-rooms/controller/game-rooms.controller.ts`
- `src/modules/game-rooms/game-rooms.module.ts`
- `src/modules/game-rooms/service/game-rooms.service.ts`
- `src/modules/game-rooms/service/game-rooms.service.spec.ts`
- `src/modules/game-rooms/service/game-start-flow.service.ts`
- `src/modules/game-rooms/service/game-start-flow.service.spec.ts`
- `src/modules/mission-results/mission-results.module.ts`
- `src/modules/mission-results/entity/mission-result.entity.ts`
- `src/modules/mission-results/service/mission-results.service.ts`
- `src/modules/realtime/gateway/realtime.gateway.ts`
- `src/modules/realtime/gateway/realtime.gateway.spec.ts`
- `src/modules/realtime/gateway/realtime.gateway.unit.spec.ts`
- `src/modules/realtime/realtime.module.ts`
- `src/modules/realtime/service/realtime-defaults.service.ts`
- `src/modules/realtime/service/realtime-event-support.service.ts`
- `src/modules/realtime/service/realtime-event-support.service.spec.ts`
- `src/modules/realtime/service/realtime.interfaces.ts`
- `src/modules/realtime/service/realtime-turn-timeout.service.ts`
- `src/modules/realtime/service/realtime-turn-timeout.service.spec.ts`
- `src/modules/turns/turns.module.ts`
- `src/modules/turns/entity/turn.entity.ts`
- `src/modules/turns/entity/turn-snapshot.entity.ts`
- `src/modules/turns/service/turns.service.ts`
- `src/modules/turns/service/turns.service.spec.ts`
- `src/shared/enums/mission.enum.ts`

**Verification:**
- [x] `./node_modules/.bin/jest --runInBand src/modules/game-rooms/service/game-rooms.service.spec.ts src/modules/game-rooms/service/game-start-flow.service.spec.ts src/modules/turns/service/turns.service.spec.ts src/modules/realtime/service/realtime-event-support.service.spec.ts src/modules/realtime/service/realtime-turn-timeout.service.spec.ts src/modules/realtime/gateway/realtime.gateway.unit.spec.ts src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts`
- [x] `gpt-5.4` review subagent run twice. Initial findings on error-path advancement, no-edit submit buffers, event order, payload shape, and missing timeout orchestration were all fixed. Final re-review reported no remaining high-severity findings in scope.
- [ ] `./node_modules/.bin/tsc --noEmit` could not be used as a clean repository-wide signal because this workspace currently reports unrelated `@nestjs/jwt` resolution failures before reaching the new C4 files.
- [ ] `src/modules/realtime/gateway/realtime.gateway.spec.ts` could not be executed in this sandbox because the environment blocks socket binding with `listen EPERM: operation not permitted 0.0.0.0`.

**Commit:**
- `acdf7af` feat(common): 게임 진행 파이프라인 연결

**Impact on next tasks:**
- `C5` can now harden authorization, duplicate submit handling, reconnect cleanup, and timeout edge cases on top of a real submit/timeout pipeline instead of placeholder hooks.
- Worker 3 follow-up work can assume canonical realtime payloads exist for `game-started`, `turn-evaluated`, `turn-changed`, `game-state-updated`, and `mission-result`, including seeded file buffers for no-edit submits.
- Any future runtime or scheduler refinement must preserve the explicit `ERROR` branch behavior and the single authoritative turn lifecycle in `TurnsService`.

**Design decisions made:**
- Kept room-start state authority in `GameRoomsService`, but moved cross-cutting broadcast composition into `GameStartFlowService` so HTTP and AI-chat starts share one side-effect path without stuffing realtime concerns into the controller.
- Chose data URLs for initial `fileUrl` payloads so the game-start contract can be satisfied immediately without introducing a new file-download endpoint in the same task.
- Implemented timeout orchestration as a realtime-side sweep service instead of a separate queue or cron worker to keep the change local to the current NestJS process while satisfying the “server detects deadline” requirement.

**Deviations from spec:**
- The sandbox prevented running the full socket-bound integration spec, so websocket verification remains unit-level here even though the emitted event names and payload keys were aligned to `docs/specs/05-api-and-realtime.md`.

**Trade-offs:**
- `RealtimeTurnTimeoutService` currently uses a simple one-second in-process sweep. That is sufficient for MVP authority and keeps the diff local, but multi-instance or high-scale deployments will want a stronger distributed scheduling mechanism later.
- Initial editor file loading uses inline `data:` URLs backed by mission structure or latest snapshot content. This keeps C4 self-contained, but a later dedicated file-serving endpoint may be preferable if mission files become large.

**Open questions:**
- [x] Should runtime or processing errors silently move the game to the next player? -> No. `ERROR` outcomes now remain explicit and stop before next-turn creation.
- [x] Can a next player submit without editing and still get the last authoritative snapshot? -> Yes. Buffers are reseeded on `game-started` and `turn-changed`.
- [x] Is server-driven timeout orchestration actually wired anywhere? -> Yes. `RealtimeTurnTimeoutService` sweeps expired turns and routes them through `timeoutTurn()`.

**Open risks or follow-ups:**
- Full websocket integration coverage still needs an environment that permits binding a listening socket, so CI or a developer machine should run `src/modules/realtime/gateway/realtime.gateway.spec.ts`.
- Runtime preparation still records explicit container-unavailable errors when no mission container exists. If a later task adds real mission-container provisioning, it must preserve the same explicit execution and judge-state behavior on failure.

**Instructions for the next worker:**
- Start `C5` from `TurnsService`, `RealtimeTurnTimeoutService`, and `RealtimeEventSupportService`. Preserve the single authoritative turn-end pipeline instead of adding side paths for submit, timeout, or disconnect cleanup.
- When tightening authorization or duplicate-submit handling, keep the server-time authority rule and do not reintroduce client-timestamp trust for turn completion.
- If you need to change event payloads, check `docs/specs/05-api-and-realtime.md` first and update both `turns.service.ts` and the realtime support tests together.
