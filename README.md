# PSL Arena

PSL Arena combines the existing PSL player auction with an eFootball tournament organiser.

## Included in this rebuild

- Single **Ready / Not Ready** captain button beside Bid controls. It is disabled while bidding is active.
- Admin Start Bid readiness warning with explicit override.
- PSL AI Host chat announcements for auction events, readiness reminders, sold/unsold results and tournament updates.
- Admin-only questions are handed to the organisers instead of being answered by the bot.
- Optional AI answers through `OPENAI_API_KEY`, with auction/tournament-aware fallback answers when no key is configured.
- Automatic auction mode with the existing auction timer and a configurable 10-second intermission before the next queued player.
- Admin quick-message presets in chat.
- Full reset/clear-data action. **No demo teams, players, bids or results are seeded.**
- Tournament teams can be imported from the auction or from CSV.
- Team badges/images.
- Round-robin fixture generation with configurable meetings per opponent.
- Matchday views and share/copy fixture text.
- Score updates, points table, top scorers and clean-sheet leaderboard.
- Optional knockout phase generated from the league table.

## Run locally

```bash
npm install
npm run dev
```

Netlify Dev serves the static app and functions together.

## Environment variables

- `OPENAI_API_KEY` — optional but recommended for free-form AI Host questions.
- `OPENAI_MODEL` — optional; defaults to `gpt-5.6-luna`.

Do not put API keys in frontend code.

## Storage

Live PSL Arena state is stored in Netlify Blobs using strong consistency. Production data uses a global store; non-production deploys use deploy-scoped storage.

## CSV import

The UI accepts CSV rows with a `type` column.

Teams:

```csv
type,name,captain,budget,image
team,Kerala Blasters,Akhil,200,https://example.com/badge.png
```

Players:

```csv
type,name,basePrice,rating
player,Player One,1,1827
```

Rows without `type` are treated as teams when they have `captain`/`budget`, otherwise as players.

## Important migration note

The previously published ChatGPT Site is a Site projection and its source is not exportable through the connected file system. The connected GitHub repository was empty, so this repository is the clean PSL Arena source of truth going forward.