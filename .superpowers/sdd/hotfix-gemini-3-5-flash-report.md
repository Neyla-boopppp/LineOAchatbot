# Gemini 3.5 Flash Hotfix Report

## Scope

Updated the Gemini chatbot adapter's stable model identifier from `gemini-2.5-flash` to `gemini-3.5-flash`, aligned its focused adapter assertion, and updated the current operator-facing project summary.

## Test-Driven Development Evidence

### RED

1. Updated `tests/chatbot-ai.test.ts` first so the grounded-reply adapter expectation requires `model: 'gemini-3.5-flash'`.
2. Initial command `npm test -- tests/chatbot-ai.test.ts` did not execute because the PowerShell execution policy blocks `npm.ps1`.
3. Ran the equivalent command through the Windows command shim:

   ```text
   npm.cmd test -- tests/chatbot-ai.test.ts
   ```

   Result: failed as expected — 1 failed, 14 passed (15 tests). The assertion expected `gemini-3.5-flash`; production sent `gemini-2.5-flash` from the adapter's model constant.

### GREEN

1. Changed only the `MODEL` constant in `lib/ai/chatbot-ai.ts` to `gemini-3.5-flash`.
2. Ran:

   ```text
   npm.cmd test -- tests/chatbot-ai.test.ts
   ```

   Result: passed — 1 test file passed; 15/15 tests passed.

## Full Suite Evidence

Ran:

```text
npm.cmd test
```

Result: passed — 1 test file passed; 15/15 tests passed.

## Files Changed

- `tests/chatbot-ai.test.ts` — expects the stable model ID in the focused adapter request assertion.
- `lib/ai/chatbot-ai.ts` — changes only `MODEL` to `gemini-3.5-flash`.
- `PROJECT_SUMMARY.md` — updates the active chatbot model shown to operators.

## Self-Review

- `git diff --check` completed with no whitespace errors.
- Reviewed the diff: it is limited to the requested test, one production constant, and current operator documentation.
- Prompts, exports, request configuration, webhook behavior, credentials, SDK dependency, and other runtime behavior are unchanged.
- `git diff -- docs/superpowers` showed no changes, preserving historical migration documents.

## Commit

Commit SHA: `f66837a7c96fca991e1650454d433b8d51942253` (superseded by the amended commit that includes this report).
