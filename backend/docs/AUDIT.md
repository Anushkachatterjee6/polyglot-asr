# Backend audit — 2026-11-11

The checkout contains a TypeScript/Lovable frontend and its API contract only. No Python service, ML model code, MUCS files, annotations, audio, checkpoints, split files, GPU runtime, or Git metadata were present. Therefore no dataset statistics, training run, real inference result, or measured evaluation can be claimed.

The frontend was treated as read-only. The requested original Git SHA cannot be recorded because this supplied checkout has no `.git` directory.

The added tooling deliberately requires an actual annotation file and verifies every referenced audio file before creating a manifest. It does not infer speakers or splits; keep MUCS official test/blind-test data outside training manifests.
