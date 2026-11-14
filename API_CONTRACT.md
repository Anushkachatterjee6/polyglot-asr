# Polyglot ASR API contract

Set `VITE_API_BASE_URL` to the FastAPI origin, for example `http://127.0.0.1:8002`. All JSON payloads use UTF-8. The client never substitutes fabricated transcripts or metrics.

## `POST /api/transcribe`

Multipart fields: `audio`, optional `domain`, optional JSON-array `vocabulary`, and optional `contextual_rescoring`.

Successful results preserve Gemini's raw verbatim `transcript` and may include `contextualTranscript`. Every successful request is persisted with optional `durationSeconds`, `processingSeconds`, `provider`, `detectedLanguage`, token `words`, and `createdAt`. Safe provider failures are also persisted with `status: "failed"` and `error`; the existing HTTP error remains unchanged.

## Live transcription analytics

- `GET /api/evaluation` returns aggregates computed only from persisted transcription history. It never uploads audio, starts a batch job, or makes a Gemini request. Its response contains operational `totals`, `languageDistribution`, activity/latency/duration chart data, and code-switching estimates.
- `PATCH /api/history/{id}/reference` accepts `{ "referenceTranscript": "human ground truth" }`. The reference is stored separately from the raw transcript. WER and CER are calculated only across completed records that have a non-empty reference; otherwise they are `null`.
- `GET /api/history` returns the preserved transcription records, including optional analytics metadata and references.

### Accuracy policy

`wer`, `cer`, and `wordAccuracy` are reference-based measurements. They are never calculated by comparing Gemini output with itself. `wordAccuracy` is `max(0, 1 - WER)`.

`estimatedWer`, `estimatedCer`, and `estimatedWordAccuracy` are optional correction-signal proxies, not ASR benchmark values. They are computed only when an existing local contextual adaptation differs from the saved raw transcript, using normalized edit distance between those two already-persisted texts. Dashboard aggregates require at least three such records; otherwise the values are `null`/“Insufficient data”. This proxy does not claim to measure true recognition error.

Existing language labels are useful operational estimates, not ground truth annotations. Tamil–English code-switching is explicitly unavailable until a reliable Tamil token classifier is added.

## Other endpoints

- `POST /api/record` — multipart `audio`; returns `{ "id": "string" }`.
- `POST /api/context` — JSON `{ "transcript": "string", "domain": "string", "vocabulary": ["string"] }`; returns `{ "original": "string", "adapted": "string" }`.
- `POST /api/analyze-language` — JSON `{ "transcript": "string" }`; returns token labels and Hindi/English/switch counts.
- `GET /api/model-info` — current provider status.
- `POST /api/export` — JSON `{ "transcript": "string", "format": "txt|json" }`.

The browser client exposes typed functions from `src/lib/polyglot-api.ts`.
