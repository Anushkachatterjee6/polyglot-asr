<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Each of the seven Polyglot ASR pages lives in `src/components/polyglot/*-page.tsx`, re-exported from `src/components/polyglot-pages.tsx`; route files in `src/routes/` only set `head()` and point at a page. Why: keeps routes thin and page code findable.
- `AppShell` wraps `<Outlet />` in `src/routes/__root.tsx`, not each route. Why: sidebar state survives navigation and the 404 page keeps the shell.
- All backend calls go through `src/lib/polyglot-api.ts`; extend types only with optional fields and document them in `API_CONTRACT.md`. Why: the FastAPI backend is developed separately against that contract.
- Never fabricate transcripts, analyses, metrics or history: show empty/unavailable states, and label any local heuristic (script-based language estimate) as such. Why: research integrity.
- Browser-only workspace state uses `src/lib/polyglot-store.ts` (localStorage preferences, sessionStorage vocabulary/last transcript); no database. Why: the user explicitly does not want one.
- Pure logic (language stats, evaluation matching, export formats, word diff) lives in `src/lib/*` with vitest tests next to it. Why: testable without the UI.
