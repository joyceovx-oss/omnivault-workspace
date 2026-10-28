<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Ordinary workspace data (projects, sections with embedded ordered cards, templates, attachment blobs) lives in IndexedDB via Dexie in `src/lib/ov/db.ts`; schema changes need a new Dexie `version(n)` block and a bump of `SCHEMA_VERSION`. Why: local-first, no account needed.
- All writes go through `src/lib/ov/repo.ts`, wrapped in `persist()` so the header's save status reflects real outcomes. Why: one data layer, honest save state.
- Pure card logic (clone with fresh ids, stitch/ungroup, reorder) lives in `src/lib/ov/cards.ts` and is unit-tested in `src/test/ov-core.test.ts`. Why: these rules must never lose or share data.
- Cloning anything into/out of templates copies attachment records and resets checklists. Why: instances stay independent from their source.
- Secret values must never be stored in workspace records, templates or backups; the vault-reference card holds only a collection label. Why: the Secrets Vault is a separate security boundary.
- Offline productivity uses the existing Dexie database with dedicated Inbox, Trash and reference tables; favorites and recents resolve current records, and search is derived from live data. Why: migrations preserve workspace data and no index or duplicated navigation state can go stale.
- Trash removal and recovery use repository transactions; attachments remain stored until independent reference-safe cleanup is available. Why: deleting one item must never remove bytes still used by another item.
