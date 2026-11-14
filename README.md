# Screenshot Match

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ba66058c-2579-4e85-88f2-7f701302a775).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
start-dev.bat
```

## Polyglot ASR backend

The transcription backend uses Gemini 3.5 Transcribe only. Follow the backend
[setup guide](./backend/docs/SETUP.md), add `GEMINI_API_KEY` only to the ignored
`backend/.env`, and keep `VITE_API_BASE_URL=http://127.0.0.1:8002` in the root
`.env.local`. `start-dev.bat` runs the backend on 8002 and frontend on 5175,
and stops with a clear error if either port is occupied. The browser never
receives the Gemini API key.
