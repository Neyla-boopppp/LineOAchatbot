# Groq to Gemini Migration Design

## Objective

Replace Groq with the Google Gemini Developer API for the production LINE OA chatbot while preserving the chatbot's existing prompts, public function contracts, fallback behavior, webhook flow, session state machine, and HR notification behavior.

This migration does not change the separate Anthropic-powered Jeeb Team system.

## Scope

### Included

- Replace the `groq-sdk` runtime dependency with the official `@google/genai` SDK.
- Introduce a provider-neutral chatbot AI module at `lib/ai/chatbot-ai.ts`.
- Preserve the existing exported functions and TypeScript contracts:
  - `generateReply`
  - `doubleCheck`
  - `extractApplicationInfo`
  - `resolveBranchName`
  - `extractScreeningInfo`
  - `DEFAULT_REPLY`
  - `KnownJobValues`
- Update the webhook to import from the provider-neutral module.
- Use the stable `gemini-2.5-flash` model for all chatbot AI operations in this migration.
- Replace `GROQ_API_KEY` documentation and configuration with `GEMINI_API_KEY`.
- Update project documentation that identifies Groq as the chatbot AI provider.
- Verify TypeScript, lint, and production build without making a live Gemini request.

### Excluded

- Screening logic changes, including missing-age handling and gender collection.
- Handover architecture changes.
- Document-receipt state changes.
- Webhook idempotency or concurrency changes.
- Admin or Jeeb Team endpoint authentication.
- Prompt redesign or chatbot personality changes.
- Provider switching, fallback to Groq, or A/B testing.
- Changes to Anthropic or the Jeeb Team agents.
- Live deployment or production environment mutation.

## Architecture

The webhook will depend on a provider-neutral module instead of a provider-named file:

```text
app/api/webhook/route.ts
          |
          v
lib/ai/chatbot-ai.ts
          |
          v
    @google/genai
          |
          v
  Gemini Developer API
```

Only the AI provider boundary changes. Callers retain the same function names, arguments, return values, and fallback semantics, minimizing regression risk in the webhook state machine.

The old `lib/ai/groq.ts` module will be removed after all imports have been migrated. A compatibility wrapper will not be retained because the repository has a single production caller and no provider-switching requirement.

## Gemini Client and Model Configuration

- Create the Gemini client lazily so importing the module does not require credentials during build-time analysis.
- Read credentials from `GEMINI_API_KEY`.
- Use the stable model identifier `gemini-2.5-flash` rather than a preview or `latest` alias.
- Keep generation limits and temperature behavior as close as the Gemini API permits to the current implementation.
- Do not enable web grounding, tools, file search, or other Gemini capabilities. Job data supplied by the application remains the only factual source.

## Data Flow and Structured Output

### Natural-language responses

`generateReply` will send the existing system instructions, formatted job rows, and user question to Gemini. It will continue to return `null` for `__NOT_IN_DATA__`, return the existing fallback on provider errors, and reject incomplete/empty responses.

`doubleCheck` will continue to perform an independent second model call and return a boolean. Only an exact normalized `OK` result will pass; ambiguous output and API errors will fail closed.

### Structured extraction

The following functions will request JSON output with explicit response schemas:

- `extractApplicationInfo`: nullable `brand`, `position`, and `branch` strings.
- `extractScreeningInfo`: nullable boolean `isThai` and nullable numeric `age`.

Parsed output will still be checked by application code before it is returned. Schema-compliant output is not assumed to be semantically correct.

`resolveBranchName` will continue to constrain the model to known branch values and will retain the deterministic exact, normalized, English-parenthetical, and partial-match checks after model generation.

## Error Handling

- Missing or invalid Gemini credentials must not crash module import.
- Provider errors in reply generation return the existing default HR-handover response.
- Provider errors in verification return `false`.
- Provider errors or invalid structured output in extraction return the current null-valued fallback objects.
- Provider errors in branch resolution return `null`.
- Logs identify the chatbot AI operation without using the old `groq` prefix.
- No automatic retry is introduced in this migration to avoid changing latency and request volume behavior.

## Configuration and Documentation

`.env.example` will document `GEMINI_API_KEY` and remove the Groq credential example. The local `.env` value will not be read, printed, committed, or automatically rewritten; the operator must add the Gemini key locally and in Vercel.

`PROJECT_SUMMARY.md` and other applicable project documentation will identify Gemini as the production chatbot provider while continuing to identify Anthropic Claude as the Jeeb Team provider.

## Verification

Verification will not make a billable external API request. It will include:

1. Search for remaining production imports, environment names, package references, and documentation references to Groq.
2. TypeScript checking.
3. ESLint checking.
4. Next.js production build.
5. Review of the resulting dependency lockfile and Git diff.

If a command reveals an unrelated pre-existing failure, it will be reported separately and will not be silently changed as part of this migration.

## Acceptance Criteria

- Production chatbot source contains no `groq-sdk` dependency or Groq client usage.
- The webhook imports the same AI capabilities from `lib/ai/chatbot-ai.ts`.
- All previous chatbot AI functions retain compatible signatures and fallback behavior.
- Gemini structured output is used for application and screening extraction.
- `GEMINI_API_KEY` is the documented chatbot credential.
- Anthropic/Jeeb Team behavior remains unchanged.
- TypeScript, lint, and production build complete successfully, or any pre-existing unrelated failure is explicitly documented.
- No live API, Vercel, LINE, Google Sheet, or deployment state is changed during verification.
