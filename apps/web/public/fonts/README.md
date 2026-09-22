# Self-hosted fonts

Four families, served from this origin rather than fetched from Google.

## Why

**The build stopped depending on a third party.** `next/font/google` fetches at
build time, and when Google was unreachable from Vercel's builder the deploy
failed inside Next's font loader with `TypeError: Cannot read properties of
null (reading '1')` — a null pointer, not a message about fonts. That will
happen again at random for as long as a deploy needs Google to answer.

**And so did the landing page.** It carried a `<link>` to
`fonts.googleapis.com`, so every visitor's browser called Google before the page
could paint. That is a third-party request on a marketing page, a round trip
before first text, and a data-protection question nobody needs to answer.

## What is here

One variable file per family — each covers every weight the app uses, because
Google serves the same variable font for all of them. Latin subset only, which
is all this app declares.

| File | Family | Covers |
| --- | --- | --- |
| `inter-variable.woff2` | Inter | 100–900, app UI and prose |
| `space-grotesk-variable.woff2` | Space Grotesk | 300–700, app display |
| `jetbrains-mono-variable.woff2` | JetBrains Mono | 100–800, data, ids and console |
| `hanken-grotesk-variable.woff2` | Hanken Grotesk | 100–900, landing |
| `hanken-grotesk-variable-italic.woff2` | Hanken Grotesk | italic, landing |

176 KB in total. Fetching each weight separately would have been 716 KB of the
same five files.

## Licence

All four are under the **SIL Open Font License 1.1**, which permits commercial
use, self-hosting and embedding. Each family's licence and copyright notice
sits beside its font file as `<family>-OFL.txt`; shipping them is what the
licence asks of anyone redistributing the files.

Two obligations worth knowing if these are ever touched:

- the notice must travel with the files, which is why they are in this
  directory and not a build artefact;
- a **modified** font must be renamed. None of these is modified — they are the
  files Google serves, subsetted by Google, not by us.

The fonts may not be sold on their own. Bundling them in software, including
commercial software, is expressly allowed.
