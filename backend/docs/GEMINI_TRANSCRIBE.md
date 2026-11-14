# Gemini 3.5 Transcribe

Polyglot ASR uses Google Gemini 3.5 Transcribe as its only active transcription
provider. The backend uploads each accepted audio file with the Gemini Files API,
creates a `gemini-3.5-transcribe` Interaction in verbatim mode with automatic
language detection, returns `interaction.output_text`, then deletes the remote
temporary file.

## Configuration

Copy `.env.example` to the ignored `backend/.env` file and set:

```dotenv
GEMINI_API_KEY=your_server_side_key
GEMINI_TIMEOUT_SECONDS=60
GEMINI_USE_ENV_PROXY=false
```

Never put the key in frontend configuration. If it is missing, `POST
/api/transcribe` returns HTTP 503 with a configuration message; no alternate ASR
provider is used.

`GEMINI_USE_ENV_PROXY` defaults to `false`, which prevents an unrelated stale
`HTTP_PROXY` or `HTTPS_PROXY` setting from breaking Gemini requests. Set it to
`true` only when the backend must use a known working corporate proxy.

## Transcript semantics

`transcript` preserves the raw Gemini verbatim output. The optional
`contextualTranscript` response field remains a separate local vocabulary/domain
adaptation so research evaluation can distinguish it from raw output. Gemini may
return Hindi in Devanagari or Tamil in Tamil script; Romanization is not guaranteed
by the provider and is not silently applied to the raw transcript.
