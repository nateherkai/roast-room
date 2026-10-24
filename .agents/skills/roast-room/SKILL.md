---
name: roast-room
description: Run the Roast Room business decision council (a board of advisor seats, three rounds, scored verdict) and save its rounds for this repository's local dashboard. Use when the user asks for Roast Room, its council, a one-seat consult, board settings, or to put a business decision to the room. Works from Claude Code and Codex.
argument-hint: "[the decision] [--quick] [--all] [--seats a,b,...] | ask <seat> [question] | board"
---

# Roast Room

This is the tool-neutral entry point for the Roast Room protocol. Claude Code loads it through `~/.claude/skills/roast-room/SKILL.md`, and Codex loads it through `~/.codex/skills/roast-room`. The protocol itself lives in the repository at `.claude/skills/roast-room/`. Every path below is relative to the repository root, whichever directory the session started in.

Invoke as `/roast-room` in Claude Code or `$roast-room` in Codex. The arguments below work the same in both.

## Read first

Read once before the first run:

- `.claude/skills/roast-room/roster.json`: every seat (key, name, pillar, scorecard dimension) and the default board
- `.claude/skills/roast-room/references/seats.md`: picking the board, weights, tensions
- `.claude/skills/roast-room/references/round-prompts.md`
- `.claude/skills/roast-room/references/scoring.md`
- `.claude/skills/roast-room/references/report-template.md`
- `.claude/skills/roast-room/references/live-room.md`

Each seat's instructions are `.claude/agents/council-<key>.md`, and its evidence is under `.claude/skills/roast-room/brains/<slug>/`. A seat needs both to sit. Skip and name any seat that lacks either.

## Modes

- **Full council** (default): the board for this decision, three rounds.
- **Quick** (`--quick`): four seats from the board, Rounds 1 and 2, Round 3 only if scores have not converged.
- **Named seats** (`--seats a,b,c`): those seats only, three rounds. Any seat in `roster.json` works, on the default board or not.
- **Everyone** (`--all`): every seat in `roster.json`, up to nine.
- **Consult** (`ask <seat> [question]`): one seat, one answer, no scoring, no session folder. Say it is a chat consult.
- **Board settings** (`board`): show or change the default board and the `"board"` setting in `roster.json`. Runs no council.

## Pick the board

1. `--seats` or `--all` on this run wins, with no question.
2. Otherwise the `"board"` field in `roster.json` decides:
   - `"ask"` (shipped default): recommend a board for this decision and confirm it with the user.
   - `"auto"`: recommend and seat it, saying who and why in one line.
   - `"default"`: seat the `"default"` list with no question.
3. Never seat more than nine.

To recommend a board, pick from every seat in the roster: the seats whose pillar the decision lives in, one seat that guards the downside (Buffett or the roster's risk seat), and the seat most likely to disagree. Leave out seats whose pillar barely touches the decision. Five to seven seats for a full council, four for `--quick`.

When asking, show the recommendation as a short list with one plain line per seat and one line naming the seats left out. Then ask the user to confirm the recommended board, use the default board, or name swaps. In Claude Code use AskUserQuestion; in Codex ask in plain text in one message. If the user said "just run it", seat the recommended board without asking. Say who is at the table in one line when the council starts.

## Step 1: The brief

Build the brief from what the user gave you. If any of these are missing, ask for them in one batch, then proceed. If the user said "just run it", fill gaps with stated assumptions.

1. The decision in one line, and the options as A, B, C. Always include "don't do it" (or "keep doing what you do now") and any alternative the founder mentioned.
2. The business: what it sells, to whom, stage, monthly revenue and margin if known, team size.
3. The resources: cash or runway, founder hours, deadline.
4. What success looks like and the time horizon.
5. Which way the founder is leaning, and why. The council tests the lean; it does not echo it.

If the project holds notes about the founder's business (`CLAUDE.md`, `business.md`, or similar), read them for real numbers before asking. Keep the brief under 300 words and mark every assumption `(assumed)`. For reversible prioritization questions, proceed on labeled assumptions and do not demand financial figures the decision does not depend on.

## Step 2: Set up the room

- Seat the board. Give each seat a relevance weight (1 to 3) with a one-line reason, per `seats.md`.
- Create `sessions/YYYY-MM-DD-<decision-slug>/` at the repository root. Write `brief.md` (brief, options, weights table) and `council.json` before round 1.
- Tell the user once: "Watch it live at http://localhost:4730." The room is optional; the council runs the same without it.

## Step 3: Round 1, opening positions

Spawn every seat in one parallel batch with the Round 1 prompt. Use the seat's named agent type if the runtime registers it (`council-<key>` in Claude Code). If it does not, use a general agent with the fallback lines in `round-prompts.md`. If the runtime cannot spawn agents, run the protocol sequentially (see below).

Save the cards verbatim to `round-1.md`, one `## <Seat>` heading per card, using the seat's `short` name from `roster.json`. Write the file as soon as the cards are back. Check every card has its scores and stance; send back any card that is missing them, once. Then add `## Chair notes` at the bottom: the one to three cruxes (the underlying disagreements, with the seats on each side), the unanimity check from `scoring.md`, and any card that broke format. Then write `cruxes.json`.

## Step 4: Round 2, debate

Spawn every seat again with the Round 2 prompt, which points them at `brief.md` and `round-1.md`. Save `round-2.md` with the same headings and `## Chair notes`: who moved and why, which cruxes resolved, which numbers are open, and the interim option scores.

## Step 5: Draft resolution

Write `draft-resolution.md`: the recommended option and verdict label, the conditions the seats asked for, next steps with dates, the cheapest test, and kill criteria. Weigh arguments, not headcount. Apply the overrides in `scoring.md`. Write `draft.json`.

## Step 6: Round 3, ratification

Spawn every seat with the Round 3 prompt. Save `round-3.md` with a `## Chair` section listing each amendment, whether it was adopted, and why. Do not run a fourth round. Quick mode skips this round when the Round 2 spread on the top option is 3 or less and no seat is at `RUIN RISK: likely`.

## Step 7: Verify, then verdict

1. Run `python3 .claude/skills/roast-room/scripts/check_quotes.py <session folder>` (use `python` if `python3` is missing). Every quote attributed to a source id must appear in a brain. Remove any that do not and note it in the chair notes. If Python is unavailable, check each attributed quote by searching that seat's brain for the exact words, and treat any not found as unverified.
2. Compute the numbers from the last round per `scoring.md`, apply overrides, write `verdict.md` from `report-template.md`, then write `verdict.json` last. The room treats `verdict.json` as the end of the council.
3. Give the user a short verdict in chat (under 200 words): the label and call, the option scores on one line, the three arguments that carried the room (one line each, with the seat), the strongest objection (one line, with the seat), and at most three next steps. Then the path to `verdict.md`, one line that the branded PDF is one click away ("Download PDF" at http://localhost:4730), and one line offering a follow-up or rerun.

## Chair rules

- Never argue a side and never add your own pillar. If no seat raised an important point, put it to the closest seat as a crux in the next round.
- Quote seats faithfully. Never rewrite a card.
- Seats speak in their expert's voice; the Chair's parts are plain English.
- Treat a unanimous Round 1 as a warning, not a win.
- Say which mode you used. A full council is three runs per seat.
- The seats are simulations built from public work. Never present a seat's line as something the real person said unless it is a verbatim quote with a source id from that seat's brain.

## Ask a single seat

`ask <seat> [question]` runs the single-seat prompt for that seat only. Read its agent file and brain, answer in that seat's voice, and label it a chat consult. No session folder, no scoring.

## Board settings

`board` shows the roster and the current `"board"` setting in plain words, then asks what to change. Edit only the `"board"` and `"default"` fields of `roster.json`, keeping the default board between one and nine seats that exist in `"seats"`. Never remove a seat from `"seats"` here. To add a brand-new advisor, use `/newroaster` in Claude Code; in Codex, follow the same steps in that skill's protocol.

## Without sub-agents (Codex or any runtime that cannot spawn agents)

Run the same protocol sequentially. For each seat, read its agent file and brain, write that seat's card, and clear it before the next seat. Do not let one card shape another in round 1. Rounds 2 and 3 work the same way, with the prior cards in view. Say in the output that the run was sequential.

## Session files and viewer

Session files are the contract with the dashboard. Follow `references/live-room.md` exactly. A chat-only answer does not complete a requested council.

The dashboard runs at `http://127.0.0.1:4730` and detects sessions automatically. Before starting any server, check whether this repository's viewer already holds that port, and do not stop an unrelated listener. Keep viewer mode and loopback binding.

## Boundaries

- Do not call the Anthropic API, enable API runner mode, or run `npm run smoke` (it makes a paid Anthropic call).
- Do not change credentials or global permissions.
- Seats use the model the current runtime provides.
