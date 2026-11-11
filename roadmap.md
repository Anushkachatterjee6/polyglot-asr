# Polyglot ASR — roadmap

## Done (from earlier work)
- [x] Shared research shell (sidebar + header) and seven page components.
- [x] Typed configurable API client (`VITE_API_BASE_URL`), honest disconnected-backend states, API contract.
- [x] API boundary tests (no fabricated transcripts).

## This pass
- [x] Routing: real file routes for all seven pages, shell around every page.
- [x] Restore the dark research-console design tokens (colours, fonts, token colours, surfaces).
- [x] Shell: mobile navigation drawer, live model/connection status, active states.
- [x] Shared session state: preferences (persisted) + vocabulary (session).
- [x] Transcription: real waveform from decoded audio, seekable playback, copy/export (txt/json), sends domain + vocabulary + rescoring.
- [x] Language analysis: token labels, distribution, code-switch statistics, switch timeline; local script-based estimate clearly labelled when no backend.
- [x] Context adaptation: custom domains, add/remove terms, session persistence, side-by-side comparison.
- [x] Model evaluation: WER/CER/LID/Switch-F1/RTF from backend only, experiment comparison table + chart, measured vs unavailable.
- [x] History: backend records only, search + filter, view dialog, txt/json download.
- [x] Settings: functional persisted preferences, endpoint + mode display, connection test.
- [x] Tests for language statistics and preferences; run tests + lint.

## Next (needs the real backend)
- [ ] Run the added XLS-R training/evaluation pipeline against an authorized MUCS Hindi-English dataset and GPU; publish only measured results.
- [ ] Set `VITE_API_BASE_URL` to the FastAPI service and re-check each page with real output.
