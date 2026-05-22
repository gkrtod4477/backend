## [2026-05-22] W1-3: Implement AI intent parsing and internal command mapping

**Plan reference:** `docs/plans/worker-1-auth-and-ai-chat-plan.md`

**Summary:**
- `POST /v1/ai-chat-sessions/{aiChatSessionId}/messages`에 LLM 기반 intent 파싱·검증·내부 command DTO 매핑을 연결했습니다.
- 지원 `requestType` 5종만 허용하며, W1-3에서는 downstream room/participant 서비스를 호출하지 않고 `commandResult.status = PENDING`만 반환합니다.
- 미션 템플릿 자연어 선택은 별도 `clientAction` 없이 `ROOM_CREATE` + `missionTemplateTitle` 경로로 처리합니다.
- 1~3차 리뷰 반영(휴리스틱·이력 보존·400 계약·트랜잭션 분리·`llmRaw` 저장)을 단일 작업 커밋 `48d5023`에 amend로 포함했습니다.

**Dependencies reviewed before starting:**
- `docs/implementaion-logs/README.md`
- `docs/implementaion-logs/worker-1/phase-1-auth.md` — Task W1-2 (open questions 확인)
- `docs/plans/worker-1-auth-and-ai-chat-plan.md` — Task W1-3
- `docs/specs/07-integrations-and-ai.md`, `05-api-and-realtime.md`, `03-modules.md`, `02-domain-model.md`
- `docs/etc/api-spec.md` — §9 POST messages

**Implementation details:**
- **`src/shared/dto/ai-chat-command.dto.ts`**: C3 연동용 discriminated union `AiChatCommandDto` 5종 + `AiChatCommandResultDto`/`AiChatCommandResultStatus`.
- **`src/integrations/llm/`**: `LlmIntentParserService` — OpenAI 호환 JSON API, 키 없음/실패 시 휴리스틱 fallback. `isInviteAcceptance`가 `USER_INVITE`보다 우선. 미션 선택 문장은 `ROOM_CREATE` + `missionTemplateTitle`.
- **`src/modules/ai-chat-sessions/intent/`**: `AiChatIntentValidator`(unsupported는 throw 대신 `outcome: 'unsupported'`), `AiChatCommandResultMapper`(W1-3는 전부 `PENDING`), `buildCommandAssistantContent`.
- **`createMessage` 트랜잭션 경계**:
  1. tx1 — `UNPARSED`/`RECEIVED` request + user `TEXT` 저장
  2. tx 밖 — `parseUserMessage()` (최대 30s, DB 락 없음)
  3. unsupported — tx2에서 `FAILED` 이력 + `llmRaw` 저장 후 `400 AI_CHAT_COMMAND_NOT_SUPPORTED`
  4. ambiguous — tx2에서 `FAILED` + assistant `TEXT` + nominal `ROOM_CREATE` `commandResult`(HTTP 200, parse 실패 UI)
  5. success — tx2에서 `COMPLETED` + `COMMAND_RESULT` assistant + `PENDING` `commandResult`
- **unsupported 저장 payload** (`responsePayload` / `requestPayload.llmRaw`):
  - `parseOutcome`, `errorCode`, `rawRequestType`, `llmRaw`(전체 `requestType`/`payload`/`confidence`/`assistantHint`)
- **`AI_CHAT_COMMAND_NOT_SUPPORTED`**: `ai-chat-error.constants.ts`에 추가. HTTP 400은 unsupported만; ambiguous는 200 `FAILED` 본문 유지.

**Files changed:**
- `src/integrations/llm/llm-intent-parser.port.ts`
- `src/integrations/llm/llm-intent-parser.service.ts`
- `src/integrations/llm/llm-intent-parser.service.spec.ts`
- `src/integrations/llm/llm.module.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.service.spec.ts`
- `src/modules/ai-chat-sessions/ai-chat-sessions.module.ts`
- `src/modules/ai-chat-sessions/constants/ai-chat-error.constants.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-assistant-content.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-command-result.mapper.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-command-result.mapper.spec.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-intent.validator.ts`
- `src/modules/ai-chat-sessions/intent/ai-chat-intent.validator.spec.ts`
- `src/shared/dto/ai-chat-command.dto.ts`
- `src/shared/dto/index.ts`

**Verification:**
- [x] `pnpm typecheck` — 통과
- [x] `pnpm test` — 39 tests 통과 (W1-3 관련: llm-intent-parser 5, intent validator 7, ai-chat-sessions 8 등)
- [x] 1차 리뷰: invite 수락 vs 초대 휴리스틱, 미션 선택 fallback, 파싱 전 user/request 이력 저장
- [x] 2차 리뷰: unsupported `400` 계약 복구, LLM 호출 트랜잭션 밖 분리 (`tx → llm → tx` 순서 테스트)
- [x] 3차 리뷰: unsupported 경로 `llmRaw` 전체 저장 검증
- [ ] `pnpm lint` / `pnpm build` — 이번 로그 작성 시점에 재실행하지 않음(직전 작업 세션에서 통과)
- [ ] `pnpm migration:run` — 로컬 Postgres 미기동으로 미실행
- [ ] HTTP 수동 스모크 — DB·LLM 키 미연결로 미실행

**Commit:**
- `48d5023` feat(ai-chat): Task W1-3 AI intent 파싱 및 command DTO 매핑

**Impact on next tasks:**
- **Task W1-4 진입 가능**: intent·command DTO·assistant metadata 골격 준비됨. W1-4는 prompt-template·풍부한 follow-up 문안·LLM 피드백 실패 fallback에 집중.
- **Task C3**: `src/shared/dto/ai-chat-command.dto.ts`를 room/participant 서비스 호출 입력으로 사용. W1-3 `PENDING` `commandResult`를 C3에서 `SUCCESS`/`FAILED`로 갱신 예정.
- **POST 동작 변경**: W1-2의 `RECEIVED` + `intentParsingPending` 동기 응답은 W1-3에서 제거됨. 프론트는 §9 `COMPLETED`/`FAILED`/`400` 분기만 사용.

**Design decisions made:**
- **동기 파싱 단일 응답**: MVP POST 한 번에 파싱 완료. 비동기 `RECEIVED` 유지하지 않음(W1-2 중립 응답 종료).
- **W1-3 무 downstream mutation**: authoritative state는 C3·Worker 2 서비스만 변경.
- **ambiguous vs unsupported 분리**: ambiguous → HTTP 200 `FAILED`(nominal `ROOM_CREATE`로 §9 `requestType` 필수 충족). unsupported → 이력 저장 후 HTTP `400`(프론트 unsupported 구분 가능).
- **휴리스틱 fallback**: `LLM_API_KEY` 없거나 API 실패 시 로컬·CI 테스트 가능.

**Deviations from spec:**
- 없음(의도적 계약: ambiguous parse 실패는 200 `FAILED` 본문, unsupported만 400 — api-spec `AI_CHAT_COMMAND_NOT_SUPPORTED` 및 §9 UI 규칙 정합).

**Trade-offs:**
- **ambiguous `requestType` placeholder**: `ROOM_CREATE` nominal은 parse 실패 전용이며 실제 room-create 명령이 아님. C3/프론트는 `parseOutcome: 'ambiguous'` metadata와 assistant `TEXT`로 구분할 것.
- **단일 amend 커밋**: 리뷰 1~3차 수정이 `48d5023` 하나에 포함. 작업 커밋과 본 로그 커밋은 분리.

**Open questions:**
- [x] W1-2 “W1-3에서 UNPARSED → 파싱 갱신” → `createMessage`에서 `COMPLETED`/`FAILED`로 갱신 규칙 구현 완료.
- [ ] C2 `requestId` 서비스/로거 전파 — W1-3에서 interceptor UUID만 사용, 후속 가능.
- [ ] C2 `toSeoulIso()` 밀리초 포함 여부 — W1-3 응답에도 동일 적용, 프론트 규약 확인은 후속.

**Open risks or follow-ups:**
- 실제 LLM 연동·Postgres 기동 후 POST messages HTTP integration test 1회 권장(unsupported 400 + history `llmRaw` 포함).
- W1-4에서 assistant 문안·prompt-template seed 연동 시 `buildCommandAssistantContent` 확장 예정.

**Instructions for the next worker:**
- W1-4 착수 전 `docs/specs/07-integrations-and-ai.md`·`docs/specs/08-security-testing-and-delivery.md` prompt-template 정책을 읽을 것.
- `AiChatCommandDto`·`AiChatCommandResultMapper` 시그니처는 C3 handoff를 위해 불필요한 변경 자제.
- unsupported 처리: `400 AI_CHAT_COMMAND_NOT_SUPPORTED` + DB `llmRaw` 저장 패턴 유지.
- `createMessage`는 `tx → llm → tx` 순서 유지(LLM을 트랜잭션 안에 넣지 말 것).
