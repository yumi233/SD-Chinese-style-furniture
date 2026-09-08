# Repository Guidelines

## Project Structure & Module Organization

This furniture image-generation workbench uses vanilla HTML/CSS/JavaScript and Express.

- `index.html`, `styles.css`, and `script.js`: interface, styling, and browser interactions.
- `server.js`: HTTP routes and service initialization.
- `src/imageGateway.js`: engine selection and generation/evaluation loops.
- `src/providers/`: A1111, ComfyUI, and compatible text/image/vision adapters.
- Other `src/` modules handle configuration, history, reference cases, and reports; `src/lib/` normalizes requests.
- `test/`: automated tests; `assets/`: public images; `docs/`: installation, usage, release, and handover documentation.

## Build, Test, and Development Commands

Node.js ≥18 is declared; existing CI and Docker use Node.js 20.

- `npm ci`: install dependencies from the lockfile.
- `Copy-Item config.local.example.json config.local.json`: create initial configuration in PowerShell; skip if the destination exists.
- `npm start` or `npm run dev`: run `server.js` at `http://127.0.0.1:3000`; neither enables automatic reload.
- `npm test` or `node --test`: run the test suite.
- `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`: build and run current source.
- `docker compose pull`, then `docker compose up -d`: run the published image.

Model services must be configured separately.

## Model Routing & Delegation

Use the lowest-cost reliable model and lowest sufficient reasoning. Check for `gemini_flash` and dynamic discovery before Luna → Terra → Sol → GPT-6 Astra; route by complexity. Follow the [routing policy](docs/MODEL_ROUTING.md).

The local Gemini MCP worker must select the highest numerically versioned available Gemini Flash text model from fresh discovery on every task (for example, 3.8 now, 3.9 when available). This user preference overrides the generic lowest-cost rule. See [worker usage and execution boundaries](docs/GEMINI_WORKER.md). Pass explicit read/write/test allowlists; inspect returned audit and diff before accepting changes.

## Coding Style & Naming Conventions

Follow existing JavaScript: two-space indentation, double quotes, semicolons, and CommonJS modules on the backend. Use camelCase for functions, variables, and module filenames, and PascalCase for classes. Keep provider-specific behavior in `src/providers/`. No formatter or linter is configured; avoid unrelated formatting changes.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Name files `test/<module>.test.js` and describe behavior in test titles. Use local mock HTTP servers and temporary directories instead of paid model calls or personal data. Add regression tests for changed behavior; run the suite before submitting.

## Commit & Pull Request Guidelines

History uses short action-oriented subjects, such as `Add Docker release workflow`. No Conventional Commits format is enforced. Keep commits focused. PRs should explain behavior changes, validation, and relevant issues.

Follow `docs/RELEASE_RULES.md`: changes affecting runtime, dependencies, configuration, storage, or assets must update Docker files and documentation together. Main-branch pushes publish GHCR images after testing.

## Security & Configuration

Never commit API keys, `.env`, `config.local.json`, or private history. Review untracked presentation materials before staging. The current server exposes the repository as static files and lacks authentication; address this before shared deployment.
