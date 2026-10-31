# Claude <-> AI Studio bridge

This folder is how Claude (works in a sandbox with no real API keys) and AI Studio (has the real Gemini key
and a live preview) talk to each other through this repository.

## How it works
1. **Claude** writes what needs real-world testing in `TASKS.md` and pushes it.
2. **AI Studio** reads `TASKS.md`, runs each task in the live preview (with the real Secrets), then writes one
   report file `reports/YYYY-MM-DD-<short-name>.md` (copy `reports/TEMPLATE.md`) and commits it.
3. The user tells Claude "report aa gayi", Claude runs `git pull`, reads the report, fixes what failed.

## Rules for AI Studio
- Report only what you actually observed. Mark each task PASS / FAIL / NOT TESTED, never guess.
- For every FAIL include: exact steps, what you expected, what happened, and any console error text (copy it).
- Never paste API keys or secrets into any file in this repo.
- Do not change app code in the same commit as a report. If you see an obvious fix, describe it in the report instead.
