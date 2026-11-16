# Deferred features

Code in this folder is **not wired into the application**. Nothing outside `src/deferred/` imports it,
it registers no Nest providers, entities, routes, or migrations, and it has no runtime effect.

Each subfolder is a candidate feature kept for later review. To adopt one, review it against
`docs/specs/`, move it into the owning module, add tests, and wire it explicitly.

| Folder | Feature |
| --- | --- |
| `replay/` | Game replay timeline builder |
| `ranking/` | Score and rating calculator |
