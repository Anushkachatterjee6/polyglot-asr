# Polyglot ASR Research Dashboard

## Build
- Replace the `/` placeholder with an overview dashboard and persistent, collapsible navigation for Overview, Transcription Studio, Language Analysis, Context Adaptation, Model Evaluation, Transcription History, and Settings.
- Create separate navigable pages for each section, with a shared research-oriented shell and responsive layouts.
- Prioritize the transcription workspace: accessible audio upload/drop area, browser microphone capture, playback controls and waveform, honest backend-unavailable/error states, transcript comparison and export controls. Never present a fake recognition result as real.
- Add language-token analysis, editable contextual vocabulary, evaluation comparisons with explicitly marked demo/sample values, history, and configuration controls.
- Keep demo fixtures clearly labeled; make API integration replaceable through a typed client configured by an environment-variable base URL, with expected request/response shapes documented in an API contract.
- Define the design tokens in `src/styles.css`, use the existing shadcn controls and installed Lucide/Recharts packages, and provide route-specific metadata.

## Validation
- Add/adjust routing and focused tests for API configuration / no fabricated transcription behavior where appropriate.
- Run relevant tests, verify the preview’s build diagnostics, and exercise navigation and key transcription states in the browser.

## Technical details
- Use TanStack Start file-based routes and preserve the existing root shell. Keep browser media operations client-only and use no server-side integration or real speech-recognition backend until one is connected.
