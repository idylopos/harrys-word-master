# Harry’s Word Master

An English–Korean vocabulary app with all 120 words from Chapters 7–10 preloaded.

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

Vocabulary, statistics, and schedules are stored in localStorage for this browser and origin. They do not sync across devices. Export a JSON backup from the footer and restore it on another device or on the published app. Restoring replaces the current local data after confirmation. Clearing browser storage removes this data.

The site is static and has no server database or account system. Fonts use Google Fonts with system fallbacks. Scheduling uses the device clock and review dates use the browser’s timezone.

## Hosting

The public app is hosted on [GitHub Pages](https://idylopos.github.io/harrys-word-master/).

Static assets are in `dist/`. Every push to `main` runs the vocabulary and scheduling tests, checks JavaScript syntax, and deploys through `.github/workflows/pages.yml`. GitHub Pages must use GitHub Actions as its publishing source.

Everyone can use the shared URL without logging in. Each visitor keeps their own uploaded lists and learning progress in their browser; these are not uploaded to GitHub or shared with other visitors. The 120 starter words are included in the public app source. To move progress from the local preview to the published app, export a backup locally and restore it on the published URL.
