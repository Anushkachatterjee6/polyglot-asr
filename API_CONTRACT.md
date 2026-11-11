# Polyglot ASR API contract

Set `VITE_API_BASE_URL` to the FastAPI origin, for example `http://localhost:8000`. The interface stays in clearly labeled demo mode when no URL is configured; audio transcription is disabled as a real result source until the backend is connected.

All JSON requests and responses use UTF-8. Errors should return a non-2xx status and a readable response body (preferably `{ "detail": "..." }`). The client displays an honest connection/error state and never substitutes sample transcripts.

## `POST /api/transcribe`
Multipart fields: `audio` (WAV/MP3/other supported audio), `domain` (optional string), `vocabulary` (optional JSON string array), `contextual_rescoring` (optional boolean string).

Response: `{ "id": "string", "filename": "string", "transcript": "string", "contextualTranscript": "string?", "durationSeconds": 12.4, "words": [{ "text": "मुझे", "language": "hi|en|other", "start": 0.0, "end": 0.3, "confidence": 0.98 }], "createdAt": "2026-11-10T18:52:00Z", "status": "completed" }`. Timestamp/confidence properties and `createdAt` can be omitted when unavailable.

## Other endpoints
- `POST /api/record` — multipart `audio`; returns `{ "id": "string" }` after accepting a browser-recorded audio blob.
- `POST /api/context` — JSON `{ "transcript": "string", "domain": "string", "vocabulary": ["string"] }`; returns `{ "original": "string", "adapted": "string" }`.
- `POST /api/analyze-language` — JSON `{ "transcript": "string" }`; returns `{ "words": [TranscriptWord], "hindiCount": 0, "englishCount": 0, "switches": 0 }`.
- `GET /api/history` — returns `TranscriptResult[]`.
- `GET /api/model-info` — returns `{ "project": "string", "dataset": "string", "model": "string", "status": "string", "supportedLanguages": ["Hindi", "English"] }`.
- `GET /api/evaluation` — returns `{ "metrics": [{ "name": "WER", "value": null, "unit": "%", "experiment": "E0" }], "experiments": [{ "name": "E0", "WER": null }] }`. Metric values remain null until produced by real evaluations. The UI matches metric names case-insensitively by abbreviation or full name (WER / "Word Error Rate", CER, LID / "Language Identification Accuracy", "Switch Boundary F1", RTF / "Real-Time Factor"). Experiment rows use `name` (e.g. `"E1"` or `"E1 · Fine-tuned XLS-R"`) plus one key per metric (`WER`, `CER`, `LID`, `SwitchF1`, `RTF`).
- `POST /api/export` — JSON `{ "transcript": "string", "format": "txt|json" }`; returns `{ "content": "string", "filename": "string" }`.

The browser client exports typed functions for these endpoints from `src/lib/polyglot-api.ts`.
