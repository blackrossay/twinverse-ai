# Security, privacy & limitations

## What we do

- **Secrets**: `MODEL_API_KEY` lives in env/`.env` only (gitignored). All model
  calls are server-side; the browser never sees keys. Verified: key material
  absent from responses and diffs (tests + pre-push grep).
- **Fictional by default**: seeds are invented personas; extraction treats bios
  as author-provided text, not verified real-world data.
- **Fact vs inference**: verified facts and confidence-scored hypotheses are
  separate types, separately rendered, with hypotheses labeled "inferred, not
  verified" in the UI.
- **No deceptive likeness**: identity cards are abstract geometric badges —
  the prompt bans text, real people, and photorealistic faces.
- **User control**: `DELETE /api/twins/{id}` removes the twin, all versions,
  and its card. Runs are immutable history; no PII beyond what the user typed.
- **Bounded spend**: max 3 scenarios/run, one repair retry per call, per-call
  timeouts, comparison cached. Fixture mode never burns API budget.
- **Validated I/O**: every model output is schema-validated before storage or
  display; invalid-after-repair returns a clear error instead of invented data.

## Limitations (read before judging or reusing)

- Twin perspectives explore **possibilities under stated assumptions** — never
  a prediction of what a real person would do. The UI and prompts say so.
- The evaluator shares the generator's model family; treat scores as estimates
  with evidence, not ground truth.
- No authentication on the API: run locally or behind your own auth. CORS
  allows only `localhost:3000` by default.
- SQLite + background tasks suit demo scale, not multi-user production.
- This build has no medical, legal, or hiring use-case hardening; council
  verdicts and secretary transcripts are illustrative starting points, and the
  UI says the final call is always yours.
