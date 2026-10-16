#!/usr/bin/env python
"""
Check every quoted line in a council session against the seats' brains.

Usage:
  python .claude/skills/roast-room/scripts/check_quotes.py <session folder>

Scans round-*.md and verdict.md for quotes attributed to a source id, like "..." (S095), and looks
for each in the brain files. A quote that is in no brain is either a quote of
another seat or the founder (fine if it appears in an earlier round file of the
same session) or an invented quote (flag it and remove it from the verdict).
Exit code 1 if any quote is unaccounted for.

Quotes may hold nested quote marks, like "Stick with big, "easy" decisions ..." (S090),
and any mix of straight, curly, single and double quote marks.
"""
import re
import sys
from pathlib import Path

BRAINS = Path(__file__).resolve().parents[1] / "brains"

# a closing quote, then a source id within 40 characters, e.g. "..." (S095), "..." [S048, 2026]
# or "..." (Lead magnets, S112)
CLOSE_THEN_ID = re.compile(r"""["”](?=[^\n"“”]{0,40}?[(\[](?:[^()\[\]\n"“”]{0,30}?,\s*)?S\d{3})""")


def norm(s):
    s = s.lower().replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    # a single quote used as a quotation mark (not inside a word, like don't) is punctuation
    s = re.sub(r"(?<![a-z0-9])'|'(?![a-z0-9])", " ", s)
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def is_open(line, i):
    """Whether the quote mark at line[i] opens a quote (curly marks say so; straight ones by context)."""
    ch = line[i]
    if ch in "“”":
        return ch == "“"
    nxt = line[i + 1] if i + 1 < len(line) else " "
    prev = line[i - 1] if i > 0 else " "
    # a mark right before "(" or "[" closes a quote, as in get,"(S011)
    return not nxt.isspace() and nxt not in "([" and not (prev.isalnum() or prev in ".!?")


def quote_ending_at(line, end):
    """The text of the quote whose closing mark is line[end], or None.

    Scans back to the line start. The quote opens at the matching opening mark, so a nested quote
    ("big, "easy" decisions") stays inside it and an earlier, separate quote stays out of it.
    An opening mark before that which never closes encloses the quote, so the quote widens to it.
    """
    depth, start = 1, None
    for i in range(end - 1, -1, -1):
        if line[i] not in '"“”':
            continue
        if not is_open(line, i):
            depth += 1
            continue
        depth -= 1
        if start is None and depth == 0:
            start = i + 1
        elif depth < 0:
            start, depth = i + 1, 0
    if start is None:
        return None
    return line[start:end]


def find_quotes(text):
    quotes = []
    for line in text.split("\n"):
        for m in CLOSE_THEN_ID.finditer(line):
            if is_open(line, m.start()):
                continue
            q = quote_ending_at(line, m.start())
            if q is not None and 20 <= len(q) <= 400:
                quotes.append(q)
    return quotes


def check(session, brains=BRAINS):
    session = Path(session)
    brain_text = norm(" ".join(p.read_text(encoding="utf-8", errors="replace") for p in Path(brains).rglob("*.md")))
    session_files = sorted(session.glob("round-*.md")) + [p for p in [session / "verdict.md"] if p.exists()]
    brief = norm((session / "brief.md").read_text(encoding="utf-8")) if (session / "brief.md").exists() else ""
    bad, ok, internal = [], 0, 0
    seen_session = ""
    for f in session_files:
        text = f.read_text(encoding="utf-8", errors="replace")
        for q in find_quotes(text):
            nq = norm(q)
            if len(nq.split()) < 6:
                continue
            if nq in brain_text:
                ok += 1
            elif nq in seen_session or nq in brief:
                internal += 1
            else:
                bad.append((f.name, q))
        seen_session += " " + norm(text)
    return ok, internal, bad


def main():
    ok, internal, bad = check(sys.argv[1])
    print(f"brain quotes verified: {ok}; quotes of earlier rounds or the brief: {internal}; unverified: {len(bad)}")
    for name, q in bad:
        print(f"  UNVERIFIED [{name}] \"{q[:160]}\"")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
