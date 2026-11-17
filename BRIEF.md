# BRIEF — free-model-aggregator-02 entry (read fully, then follow)

You are improving a competition entry. The kit lives at `/root/makefun/free-model-aggregator-02-kit`; this repository (`/root/makefun/repo`) is the bot.

## What the entry must be
One server: `main.ts` (Node 22, standard library only — nothing is installed, TypeScript runs directly, relative imports need the `.ts` extension) at this repository root.

Read these first, completely (copies live in `.reference/` inside this repo):
- `.reference/main.ts` — the baseline (currently copied here as our main.ts)
- `.reference/lib/providers.ts` and `.reference/lib/wire.ts`
- `.reference/RULES.txt` — scoring columns and tie-break
- `.reference/practice/trial-*/` — practice instances
- `.reference/program/` — the sealed generator/env/scorer

## How a trial works (summary — verify details in RULES.txt)
- The env sends 6 prompts: 3 on the OpenAI wire (`POST /v1/chat/completions`), 3 on the Anthropic wire (`POST /v1/messages`); some stream (SSE), 2 JSON-mode, 1 with tools, 3 with a system prompt, weights 1 or 2. Each names model "auto" and carries a unique token the answer must contain.
- Your server registers `{protocol_version:1, port, catalog}` at `POST $MAKEFUN_ENV_URL/register`, serves `GET /v1/models` (answer shape follows auth header: x-api-key=Anthropic, Authorization=OpenAI), answers each prompt by dialling ONE free model through the gateway at `$OPENAI_BASE_URL` with `OPENAI_API_KEY` (a dummy — the gateway swaps it for the real pushed key). Anthropic-shaped requests must be translated to Chat Completions for the gateway, and the reply translated back.
- The only dialable ids are the brief's free models (`openrouter/...:free`). Poll `GET $MAKEFUN_ENV_URL/work` every 100ms; exit 0 when `done:true`. Wall budget 240s; each prompt capped 30s by the env client.
- `node main.ts --list` prints the catalog JSON and exits 0 before any server starts.

## Scoring (weighted): quality 60, served 15, wire 10, failover 10, catalog 5. Tie-break: fewer upstream gateway calls, then earlier receipt.
The `model` field you report must be the model you really dialled.

## Improvements to make (from the starter's own TODOs)
1. **quality**: rank free candidates by `rating_milli` from the brief, subject to each prompt's requirements (tools, JSON mode, context length); always pick the highest-rated eligible model. Weighed prompts matter more.
2. **failover**: on 4xx/5xx or a streamed error, retry on the NEXT-best eligible model; keep total gateway calls low (tie-break).
3. **cooldowns**: track per-model 429s; a cooling-down model is skipped without spending a call on it.
4. **catalog**: register exactly the brief's free model set (all 14 ids), and answer GET /v1/models with the same set on both auth headers — no more, no fewer.
5. Keep streaming correct on both wires (SSE format), JSON mode passed through, tools passed through, and the prompt's token must appear in the answer body.

## Testing
Practice trials: `.reference/practice/trial-0` etc. Check `.reference/program/env/server.mjs` and the kit CLI (`node /root/makefun/free-model-aggregator-02-kit/cli/makefun.mjs --help`, `grade-local`) to run a local trial. A real graded run needs the gateway; if it is not reachable from here, at minimum run the env server directly against your entry and verify protocol steps work (register, 6 prompts, exit 0). Real OpenRouter calls go through `$OPENAI_BASE_URL` if set, else directly to OpenRouter with `$OPENROUTER_API_KEY` in the environment.

## Hard constraints
- Node stdlib only; no npm install in the entry.
- Keep `main.ts` at root; keep the LICENSE file.
- Never print or commit secrets. The OpenRouter key stays in the environment, never in a file in this repo.
