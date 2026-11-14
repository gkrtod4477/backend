# Deferred features job — progress (branch main)

Goal: add deferred (not wired) feature code over 7 days so GitHub Insights shows daily additions.

## Rules (user decisions, 2026-11-14)
- Total additions over 7 days: 5000–5500 lines (GitHub additions, all files incl. this doc). Code target ~720 lines/day.
- Location: `src/deferred/<feature>/`. Never imported from anywhere outside `src/deferred/`. No `@Entity`, no `*.entity.ts`, no Nest `@Module`/`@Controller`/`@Injectable` registration, no migrations.
- No tests (`*.spec.ts`) for deferred code.
- One day per user trigger ("Day N 진행"). Commit directly to main; several commits per day are fine. No push unless asked.
- Verification per day: `pnpm typecheck`, `pnpm lint` on `src/deferred`, `grep` that nothing outside `src/deferred` imports it.

## Plan
| Day | Feature | Folder | Status |
|---|---|---|---|
| 1 | Game replay timeline builder | `src/deferred/replay` | in progress |
| 2 | Score and rating calculator | `src/deferred/ranking` | pending |
| 3 | Profile statistics aggregator | `src/deferred/profile-stats` | pending |
| 4 | Achievement rule engine | `src/deferred/achievements` | pending |
| 5 | WebSocket / submission rate limiter | `src/deferred/rate-limit` | pending |
| 6 | Hint cooldown and penalty policy | `src/deferred/hint-policy` | pending |
| 7 | Reconnection session recovery helper | `src/deferred/reconnection` | pending |

## Log
- Additions so far: 0

## Next
- Day 1
