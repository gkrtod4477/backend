## [2026-05-22] W3-3: Implement runtime adapter and execution persistence

**Plan reference:** `docs/plans/worker-3-realtime-runtime-execution-plan.md`

**Summary:**
- Docker-socket sibling-container 전제를 따르는 runtime adapter를 추가했습니다.
- `executions` 엔티티, 상태 전이 서비스, migration을 추가해 `PENDING -> RUNNING -> SUCCESS | FAILED | TIMEOUT` 흐름을 영속화했습니다.
- GPT-5.4 리뷰에서 발견된 runtime writable path, runtime rejection 명시화, W3-2 multi-socket disconnect 오판정 문제를 반영했습니다.

**Dependencies reviewed before starting:**
- `docs/plans/README.md` — shared foundation 완료 후 worker 진행 규칙 재확인
- `docs/plans/common-sequential-plan.md` — C1/C2 완료, worker-stream contract freeze 확인
- `docs/plans/worker-3-realtime-runtime-execution-plan.md` — W3-3 acceptance criteria 및 verification 범위 확인
- `docs/implementaion-logs/README.md` — task 단위 커밋/로그 분리 규칙 확인
- `docs/implementaion-logs/common/phase-1-foundation.md` — shared enum, response, persistence baseline 확인
- `docs/implementaion-logs/worker-3/phase-1-realtime.md` — W3-1/W3-2 산출물과 follow-up review 대기 항목 확인
- `docs/specs/03-modules.md` — `integrations/runtime`, `executions` 모듈 책임 경계 확인
- `docs/specs/04-data-model.md` — `executions` 영속 필드와 인덱스 기대치 확인
- `docs/specs/05-api-and-realtime.md` — `ExecutionStatus` canonical set 확인
- `docs/specs/06-gameplay-lifecycle.md` — submit/timeout 실행 파이프라인과 explicit error 요구 확인
- `docs/specs/07-integrations-and-ai.md` — sibling-container Docker model, `docker exec`, tmpfs/runtime limit 규칙 확인
- `docs/specs/08-security-testing-and-delivery.md` — runtime secret redaction, timeout 분리, reconnect policy 확인

**Implementation details:**
- `src/integrations/runtime/runtime.interfaces.ts`: mission container preparation, code execution, command runner, runtime result union(`completed`, `timeout`, `runtime-failure`) 계약을 정의했습니다.
- `src/integrations/runtime/runtime-defaults.service.ts`: Docker CLI 기반 adapter를 추가했습니다. `docker run -d`로 sibling container를 준비하고, read-only rootfs + `/tmp`, `/workspace` tmpfs를 구성합니다.
- 동일 adapter는 `/tmp` 또는 `/workspace` 바깥 경로를 사전에 거절해 runtime write failure를 explicit하게 만들고, `docker exec -i`로 파일 주입 후 실행 결과를 수집합니다.
- `src/modules/executions/entity/execution.entity.ts`: room/mission/turn/user/container context, stdout/stderr/exit code, runtime failure code/message, started/finished timestamp를 저장하는 실행 엔티티를 추가했습니다.
- `src/modules/executions/service/executions.service.ts`: 실행 레코드를 `PENDING`으로 생성한 뒤 `RUNNING`으로 승격하고, runtime 결과를 `SUCCESS`, `FAILED`, `TIMEOUT`로 매핑해 저장합니다.
- 동일 서비스는 runtime adapter rejection 시에도 실행 레코드를 `FAILED` + `RUNTIME_EXECUTION_REJECTED`로 닫아 `RUNNING` 상태가 고아로 남지 않게 했습니다.
- `database/migrations/1764205200000-CreateExecutionsTable.ts`: `executions` 테이블과 room/mission/turn, room/mission/user 인덱스를 추가했습니다.
- `src/modules/realtime/gateway/realtime.gateway.ts`: GPT-5.4 follow-up 리뷰 반영으로 room+user 단위 socket 집계를 도입했고, 같은 유저의 마지막 socket이 닫힐 때만 disconnect cleanup을 호출하도록 보강했습니다.
- 테스트는 runtime command mapping, execution status transition, rejection/timeouts, multi-socket disconnect 경계를 각각 고정했습니다.

**Files changed:**
- `database/migrations/1764205200000-CreateExecutionsTable.ts`
- `package.json`
- `tsconfig.json`
- `src/integrations/runtime/runtime.constants.ts`
- `src/integrations/runtime/runtime.interfaces.ts`
- `src/integrations/runtime/runtime-defaults.service.ts`
- `src/integrations/runtime/runtime-defaults.service.spec.ts`
- `src/integrations/runtime/runtime.module.ts`
- `src/modules/executions/entity/execution.entity.ts`
- `src/modules/executions/service/executions.service.ts`
- `src/modules/executions/service/executions.service.spec.ts`
- `src/modules/executions/executions.module.ts`
- `src/modules/realtime/gateway/realtime.gateway.ts`
- `src/modules/realtime/gateway/realtime.gateway.unit.spec.ts`

**Verification:**
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm lint`
- [x] `corepack pnpm build`
- [x] `corepack pnpm test -- executions.service.spec.ts runtime-defaults.service.spec.ts realtime.gateway.unit.spec.ts`
- [x] `corepack pnpm test -- realtime.gateway.spec.ts` — sandbox 포트 바인딩 제한으로 권한 상승 후 재실행, 9개 테스트 통과
- [x] GPT-5.4 review subagent 재검토 완료 — writable tmpfs, runtime rejection persistence, multi-socket disconnect, duplicate migration artifact 이슈 반영 후 잔여 finding 없음 확인
- [ ] 실제 Docker socket 기반 runtime smoke test — 로컬 Docker/runtime image 미준비로 미실행
- [ ] 실제 DB migration run — upstream room/turn/mission 테이블이 아직 없는 병렬 작업 구간이라 미실행

**Commit:**
- `8647929` feat(runtime): 실행 영속화 및 어댑터 추가

**Impact on next tasks:**
- `W3-4`와 shared `C4`는 `ExecutionsService.executeTurnCode()`를 turn submit/timeout 파이프라인에 연결해 execution persistence를 바로 사용할 수 있습니다.
- shared gameplay integration은 turn snapshot 저장 직후 `filePath`, `content`, `command`, `containerId`를 runtime adapter 입력으로 전달하면 됩니다.
- game start 단계에서는 실제 `game_room_missions.container_id` 저장 책임을 room/mission 초기화 경로에 연결해야 합니다.

**Design decisions made:**
- **runtime result union 명시화**: non-zero exit, timeout, runtime infrastructure failure를 같은 성공 경로로 섞지 않고 별도 result kind로 분리했습니다.
- **writable tmpfs 제한**: spec의 read-only rootfs 원칙을 유지하면서 `/workspace`와 `/tmp`만 writable mount로 허용했습니다.
- **output redaction seam**: secret masking은 실행 서비스 입력(`redactionTokens`)에서 처리해 stdout/stderr persistence 전에 차단할 수 있게 했습니다.
- **multi-socket disconnect gate**: user-level socket 집계를 gateway support layer에 두고, authoritative `LEFT` 전이는 마지막 socket 종료 시점에만 service로 위임했습니다.

**Deviations from spec:**
- 없음. runtime은 sibling-container + `docker exec` 모델을 유지했고, `ExecutionStatus` 집합도 canonical contract와 일치합니다.
- migration은 병렬 작업 충돌을 줄이기 위해 foreign key를 아직 두지 않았습니다. room/mission/turn/user link는 UUID context 컬럼과 인덱스로 유지하며, FK 정합성은 shared integration 단계에서 합치는 것이 안전합니다.

**Trade-offs:**
- **실제 Docker SDK vs CLI runner**: MVP 범위에서는 외부 SDK 의존성 없이 `docker` CLI wrapper로 command mapping과 테스트 격리를 먼저 고정했습니다.
- **migration 즉시 FK 추가 vs context-only additive table**: upstream 테이블 생성 순서가 아직 고정되지 않아 W3-3에서는 additive table만 만들고 FK는 뒤로 미뤘습니다.
- **listener-based realtime spec 수정 vs focused unit spec 추가**: sandbox 포트 바인딩 제약 때문에 multi-socket disconnect는 직접 unit spec으로 고정했고, 기존 listener-based spec은 권한 상승 재실행으로 회귀를 확인했습니다.

**Open questions:**
- [ ] `game_room_missions.container_id` 저장을 Worker 2 game-start 경로에서 붙일지, shared `C4` 통합 단계에서 room mission 생성과 함께 붙일지 결정 필요
- [ ] execution command source를 mission template 고정 command로 둘지, step별 command override를 허용할지 shared gameplay integration 단계에서 결정 필요

**Open risks or follow-ups:**
- 현재 runtime adapter는 Docker CLI binary와 mounted socket 존재를 전제합니다. 운영 환경에서는 binary 경로와 권한 검증이 추가로 필요합니다.
- migration이 FK 없이 먼저 추가되어 있으므로 이후 공용 migration 단계에서 참조 무결성 정리를 빠뜨리면 schema drift가 남을 수 있습니다.
- secret redaction은 호출자가 `redactionTokens`를 전달해야 동작합니다. shared integration에서 runtime/LLM/DB secret 값을 어떤 범위까지 마스킹할지 규칙화가 필요합니다.

**Instructions for the next worker:**
- `W3-4` 또는 `C4`에서 turn submit/timeout 경로를 연결할 때 `ExecutionsService.executeTurnCode()` 호출 전에 turn snapshot persistence를 먼저 수행할 것
- runtime file path는 `/workspace/...` 또는 `/tmp/...`로만 전달할 것
- `database/migrations/1764205200000-CreateExecutionsTable.ts`는 FK 없는 additive migration이므로, upstream schema가 고정되면 후속 migration으로 FK/constraint를 정리할 것
- `realtime.gateway.ts`의 user-level socket 집계를 제거하거나 우회하지 말 것. 마지막 socket 종료 전에는 disconnect authority를 호출하면 안 됩니다.
