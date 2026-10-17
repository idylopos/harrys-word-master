# Harry’s Word Master

An English–Korean vocabulary app with 180 built-in words: Chapters 7–10 (120 words), Day 11 — Jobs & Work (0301–0330, 30 words), and Day 12 — City & Traffic (0331–0360, 30 words).

## Run locally

Requires Python 3 and Node.js 18+ (Node is only needed for the test command).

```sh
npm start
```

Open http://localhost:4173. Alternatively run `python3 -m http.server 4173 --directory dist`.

```sh
npm test
```

## Learning

- Each word has independent English-to-Korean and Korean-to-English cards.
- Correct due reviews advance through 1, 3, 7, 14, 30, 60, and 90 days.
- Incorrect answers and “I don’t know yet” reset the card to a 10-minute review; the next correct due review restarts at 1 day.
- Correct early practice does not advance the schedule. Incorrect early practice resets the card.
- On opening and when continuing a selected round, only checked word lists are included. Due cards take priority within that selection. The separate Due reviews tab includes all saved lists.
- Check one or more Word Lists (for example, Day 11 and Day 12), then click “Start selected round” to shuffle them together. Chapter checkboxes are grouped by list, so identical chapter names do not collide. The selection is remembered across reloads and backups; old single-list selections migrate automatically without changing existing progress keys. Settings apply to the next round, so changing checkboxes does not interrupt the current card.
- Any single listed Korean meaning is accepted. Matching ignores spacing and punctuation, allows omitted parenthetical qualifiers, and handles the supplied list’s obvious spelling variants. It does not use an AI semantic grader.

## Weekly imports and persistence

Paste a list or upload a UTF-8 TXT, CSV, TSV, or Markdown file. Plain English–Korean lines, Markdown tables, and vertically copied extraction tables are supported. Optional numbers, parts of speech, empty table cells, and table rules are ignored. Optional headings include `CHAPTER 7` or `CHAP.8`. Expand “Review recognized words” to check the actual word–meaning pairs, and check skipped notes or incomplete entries before saving. Paragraphs explaining the extraction are not vocabulary. For the most reliable photo extraction, request one `English word Korean meanings` entry per line, without tables, numbers, parts of speech, pronunciation, examples, or explanatory prose.

Built-in lists are available to everyone with the URL, including returning visitors and people restoring older backups. Fresh browsers start with Day 11 and Day 12 selected. When an existing imported list matches a built-in list’s complete English–Korean contents, it is reused in place, preserving its IDs, title, selection, and review history. Custom or partial imports remain intact alongside the built-ins.

## Share word lists

After adding a list, click **Share** beside it under **Word Lists**, then **Copy link**. Send that generated link to another person. They preview its words and click **Add list & study** to save it without replacing their own lists, scores, or schedules. Reopening an equivalent list reuses the recipient's existing list and progress. Built-in lists can also be shared.

Share links contain a vocabulary snapshot in the URL fragment, using versioned UTF-8 data with optional gzip compression. The shared data includes only the list title, English words, Korean meanings, and chapters; sender IDs and learning records are excluded. The generated link is specific to that list: the ordinary site URL does not automatically include personal uploads. Links do not update when the sender changes their local copy; create a new link to share changes.

For longer lists, choose **Download list file** and send the `.json` file. Recipients open it through **Add word list → Choose a vocabulary file**, preview it, and choose **Add list & study**. This is a vocabulary-only import, separate from the full backup/restore flow. Sharing supports up to 1,000 words and 500 KB of decoded data; links have a 16,000-character cap and the file option handles lists too large for a link. Encoded input is validated and decompression output is bounded before preview or import.

Personal vocabulary, statistics, and schedules are stored in localStorage for this browser and origin. They do not sync across devices. Export a JSON backup from the footer and restore it on another device or on the published app. Restoring replaces the current local data after confirmation. Clearing browser storage removes this data.

The frontend is static and does not store learning progress on a server. An optional Supabase catalog holds only public vocabulary; account-based progress sync is not provided. Fonts use Google Fonts with system fallbacks. Scheduling uses the device clock and review dates use the browser’s timezone.

## Hosting

The public app is hosted on [GitHub Pages](https://idylopos.github.io/harrys-word-master/).

Static assets are in `dist/`. Every push to `main` runs the vocabulary and scheduling tests, checks JavaScript syntax, and deploys through `.github/workflows/pages.yml`. GitHub Pages must use GitHub Actions as its publishing source.

Everyone can use the shared URL without logging in. Each visitor keeps their own uploaded lists and learning progress in their browser; these are not uploaded to GitHub or shared with other visitors. The 180 built-in words are included in the public app source; learning progress is private to each browser. Adding a personal list saves it locally; choosing Share lets you send its vocabulary through a dedicated link or list file. To move progress from the local preview to the published app, export a backup locally and restore it on the published URL.

## Public catalog and duplicate cleanup

Duplicate lists are consolidated by their complete normalized vocabulary, regardless of titles, chapter labels, or definition order. Repeated equivalent words are also removed from combined practice pools, separately for each direction. Different meanings remain distinct. Migration keeps the most recent review record (a recent miss wins over an older correct answer), preserves aggregate scores, and remaps selections. Original merged copies are retained in `duplicateListArchive` inside local backup data; old progress keys are not deleted.

The public-catalog client, append-only database schema and setup script are prepared. **The backend is not yet provisioned:** automatic approval review requires explicit user approval to create the persistent Supabase project. `dist/catalog-config.js` remains blank, so no public upload is claimed or attempted. Link/file sharing and local duplicate cleanup remain available.

Once configured, new Add word list uploads publish automatically. All visitors to the main URL load the public catalog and refresh it every 30 seconds while the app is open. Failed uploads stay queued locally and retry on reconnect or focus. Older browser-only lists are not silently published; their Publish button explicitly adds them to the shared catalog. Only titles and vocabulary are uploaded; scores and review schedules stay in each browser. Identical public submissions return the existing immutable catalog entry.

The SQL migration in `catalog/migrations/` enables row-level security and grants anonymous visitors only read access plus a validated publishing RPC. There are no anonymous update/delete permissions. Payload sizes, entry counts, hourly publication volume and catalog capacity are bounded. Privileged credentials never belong in frontend configuration; only the intentionally public anon key is used there.

After backend creation is explicitly approved, the maintainer can use the existing Supabase CLI login with `scripts/catalog-admin.py`: create the dedicated project in an approved free organization (`HARRY_CATALOG_ORG`), wait for it to become active, apply migrations, and write the anon configuration with `configure`. Commit that public configuration and redeploy. Live database migration, RLS checks and two-client catalog publishing still require verification after provisioning. Current catalog transport tests use a fake fetch service and do not imply a live backend exists.
