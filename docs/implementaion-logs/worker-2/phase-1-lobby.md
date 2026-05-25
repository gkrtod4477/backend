## [2026-05-26] W2-1: Implement room and participant persistence model

**Plan reference:** `docs/plans/worker-2-room-participant-mission-plan.md`

**Summary:**
- Added `game_rooms` and `game_room_participants` persistence, migration, and service-layer lifecycle validation for room creation, invites, invite acceptance, invite denial, and leave transitions.
- Enforced the single-`WAITING`-room-per-user rule with transactional PostgreSQL advisory locks around room creation and membership mutations.
- Added unit tests for owner authorization, invited-user authorization, duplicate membership rejection, invalid transition rejection, stale denial rejection, and `WAITING` room conflict handling.

**Dependencies reviewed before starting:**
- `docs/plans/README.md`
- `docs/plans/common-sequential-plan.md`
- `docs/plans/worker-2-room-participant-mission-plan.md`
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/common/phase-1-foundation.md`
- `docs/specs/00-overview.md`
- `docs/specs/02-domain-model.md`
- `docs/specs/03-modules.md`
- `docs/specs/04-data-model.md`
- `docs/specs/05-api-and-realtime.md`
- `docs/specs/06-gameplay-lifecycle.md`
- `docs/specs/08-security-testing-and-delivery.md`

**Implementation details:**
- `GameRoomEntity` and `GameRoomParticipantEntity` were added with canonical enum-backed `text` status fields, timestamps from `BaseEntity`, and indexes matching `docs/specs/04-data-model.md`.
- Added migration `1779750000000-CreateGameRoomAndParticipantTables.ts` for `game_rooms`, `game_room_participants`, the `(game_room_id, user_id)` uniqueness rule, and the documented lookup indexes.
- `GameRoomsService.createRoom()` now runs inside a transaction, takes a PostgreSQL advisory lock keyed by `ownerUserId`, rejects existing `WAITING` memberships, creates the room, and creates the owner participant as `OWNER + JOINED`.
- `GameRoomParticipantsService` now handles invite, accept, deny, and leave with service-layer authorization and transition validation. Invite locks both owner and invitee in stable order to avoid owner-leave races flagged in review.
- `acceptInvitation()` and `denyInvitation()` now reject non-`WAITING` rooms. `inviteParticipant()` now requires an active `OWNER + JOINED` participant row instead of trusting only `game_rooms.owner_user_id`.
- Added `tsconfig.spec.json` and Jest `moduleNameMapper` so spec files compile and resolve repo path aliases during targeted tests and lint.

**Files changed:**
- `database/migrations/1779750000000-CreateGameRoomAndParticipantTables.ts`
- `src/app.module.ts`
- `src/modules/game-rooms/entity/game-room.entity.ts`
- `src/modules/game-rooms/service/game-rooms.service.ts`
- `src/modules/game-rooms/service/game-rooms.service.spec.ts`
- `src/modules/game-rooms/game-rooms.module.ts`
- `src/modules/game-room-participants/entity/game-room-participant.entity.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.ts`
- `src/modules/game-room-participants/service/game-room-participants.service.spec.ts`
- `src/modules/game-room-participants/game-room-participants.module.ts`
- `package.json`
- `tsconfig.json`
- `tsconfig.spec.json`
- `eslint.config.js`

**Verification:**
- [x] `corepack.cmd pnpm typecheck`
- [x] `corepack.cmd pnpm lint`
- [x] `.\node_modules\.bin\jest.cmd --runInBand src/modules/game-rooms/service/game-rooms.service.spec.ts src/modules/game-room-participants/service/game-room-participants.service.spec.ts`
- [x] Manual check: `game_rooms(owner_user_id, status)` and `game_room_participants(user_id, membership_status)` indexes plus `(game_room_id, user_id)` uniqueness were added with snake_case column naming.
- [x] Manual check: no controller or gateway logic was introduced that bypasses the services.
- [x] `gpt-5.4` subagent review completed; initial concurrency and authorization findings were fixed, and final pass reported no remaining P1-P3 findings.
- [ ] Integration-level concurrency test against a real PostgreSQL transaction boundary was not run because this repository does not yet have DB-backed integration test wiring.

**Commit:**
- `1df0303` feat(worker-2): implement room and participant persistence

**Impact on next tasks:**
- `W2-2` can build query APIs on top of stable room and participant persistence/services without redefining membership rules.
- `C3` can call room create/invite/accept/deny logic through these services rather than mutating repositories directly.
- Room and participant mutations now assume PostgreSQL advisory-lock support because the app runtime is fixed to PostgreSQL in spec.

**Design decisions made:**
- Chose transactional PostgreSQL advisory locks keyed by user ID to serialize `WAITING` room membership changes across room creation, invite, accept, deny, and leave flows without inventing a new coordination table.
- Kept the single-`WAITING`-room rule in the service layer, consistent with `docs/specs/04-data-model.md`, and used the DB only as a transactional coordination aid rather than adding a speculative schema workaround.
- Required `OWNER + JOINED` membership for invite authorization so a departed owner cannot continue mutating lobby state.

**Deviations from spec:**
- None. The implementation follows the canonical enum sets and service-layer authorization requirements from `docs/specs/02-domain-model.md`, `04-data-model.md`, `05-api-and-realtime.md`, and `08-security-testing-and-delivery.md`.

**Trade-offs:**
- Did not add a real DB integration test for concurrent requests in `W2-1` because the repository currently lacks database-backed integration test scaffolding. Instead, the service logic now uses transaction-level locking and unit tests cover the non-concurrent rule paths.
- Did not introduce user-table foreign keys in this task because Worker 1 auth persistence is owned elsewhere and the current task only required room/participant persistence plus local invariants.

**Open questions:**
- [x] Should `inviteParticipant()` also block invites when the target room is no longer actively owned by a joined owner? Resolved by requiring an active `OWNER + JOINED` participant row in addition to `owner_user_id`.
- [x] Is stale invite denial after room start allowed? Resolved as `No`; `denyInvitation()` now rejects rooms outside `WAITING`.

**Open risks or follow-ups:**
- Concurrency protection depends on PostgreSQL advisory locks, so any future non-PostgreSQL persistence experiment must revisit this rule explicitly.
- `W2-2` query APIs should treat multiple `WAITING` rooms as abnormal state only for defensive reads; mutation services now actively prevent creating that state.
- A future DB-backed integration test should race `createRoom`, `inviteParticipant`, `acceptInvitation`, and `leaveRoom` once shared test infrastructure exists.

**Instructions for the next worker:**
- Read this log before starting `W2-2`, then use `GameRoomsService` and `GameRoomParticipantsService` as the only mutation path for lobby state.
- Preserve the advisory-lock pattern when adding any new membership mutation that can affect the single-`WAITING`-room invariant.
- Do not bypass `OWNER + JOINED` checks with controller-layer shortcuts; the service-layer authorization is part of the accepted contract now.
- If `W2-2` adds response DTOs for these entities, serialize timestamps through the shared Asia/Seoul policy rather than exposing raw entity dates.
