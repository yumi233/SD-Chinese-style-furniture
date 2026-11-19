# Repository Guidelines

## Interface Writing & Layout

Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.

Shared tokens and `yui-*` components come from the [yui design system](https://github.com/yumi233/yui) (rules in its `docs/RULES.md`), pinned in `package.json` and vendored to `public/vendor/yui/` by `npm run ui:sync`; never edit the vendored files. 木生-specific rules are in [docs/UI_RULES.md](docs/UI_RULES.md); the live library is `public/lab/components.html`. New shared components go into yui first, then bump the version and sync.

## Project Structure & Module Organization

This furniture image-generation workbench uses vanilla HTML/CSS/JavaScript and Express.

- `public/index.html`, `public/studio.html`, `public/css/`, `public/js/`, and `public/assets/`: interface, styling, browser interactions, and public assets. The old root `index.html`, `styles.css`, and `script.js` were removed.
- `server.js`: environment loading, runtime assembly, and service initialization.
- `src/http/app.js`, `src/http/routes.js`, and `src/http/middleware.js`: app factory, shared `/api/v1` and legacy `/api` routes, Origin/session/rate-limit middleware, and safe error handling.
- `src/userStore.js`: users, hashed sessions, profile updates, and atomic JSON persistence.
- `src/imageGateway.js`: engine selection and generation/evaluation loops.
- `src/providers/`: A1111, ComfyUI, and compatible text/image/vision adapters.
- Other `src/` modules handle configuration, history, reference cases, and reports; `src/lib/` normalizes requests.
- `test/`: automated tests; `assets/`: public images; `docs/`: installation, usage, release, and handover documentation.

## Build, Test, and Development Commands

Node.js ≥18 is declared; existing CI and Docker use Node.js 20.

- `npm ci`: install dependencies from the lockfile.
- `Copy-Item config.local.example.json config.local.json`: create initial configuration in PowerShell; skip if the destination exists.
- `npm start` or `npm run dev`: run `server.js` at `http://127.0.0.1:3000`; neither enables automatic reload. Set `HOST`, `PORT`, `MUSHENG_PORT`, and `COOKIE_SECURE` explicitly when needed.
- `make test` / `make check`: run the Node test suite and syntax checks. `make config` validates Compose without starting a service; `make admin-id EMAIL=...` reads an ID from the running Compose container without printing secrets.
- `npm test` or `node --test`: run the test suite.
- `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`: build and run current source.
- `docker compose pull`, then `docker compose up -d`: run the published image.

Model services must be configured separately.

## Model Routing & Delegation

Use `gpt-6.2-sol` for all implementation and `gpt-6.2-astra` for all design, review, and acceptance. Luna, Terra, and earlier GPT versions are excluded. Follow the [routing policy](docs/MODEL_ROUTING.md).

Use Gemini only for human-facing UI copy in 简/繁/EN, reference-case text, and prose in docs and reports. Check for the latest Gemini Pro (`gemini-pro-latest`) on each task and use the highest-numbered Gemini Flash only if Pro is unavailable. If Flash is also unavailable, report the blocker and stop. Astra reviews Gemini's text in the PR. See the [Gemini worker guide](docs/GEMINI_WORKER.md) for the Flash fallback entry point.

## Coding Style & Naming Conventions

Follow existing JavaScript: two-space indentation, double quotes, semicolons, and CommonJS modules on the backend. Use camelCase for functions, variables, and module filenames, and PascalCase for classes. Keep provider-specific behavior in `src/providers/`. No formatter or linter is configured; avoid unrelated formatting changes.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Name files `test/<module>.test.js` and describe behavior in test titles. Use local mock HTTP servers and temporary directories instead of paid model calls or personal data. Add regression tests for changed behavior; run the suite before submitting.

## Commit & Pull Request Guidelines

History uses short action-oriented subjects, such as `Add Docker release workflow`. No Conventional Commits format is enforced. Keep commits focused. PRs should explain behavior changes, validation, and relevant issues.

Follow `docs/RELEASE_RULES.md`: changes affecting runtime, dependencies, configuration, storage, or assets must update Docker files and documentation together. Main-branch pushes publish GHCR images after testing.

## Security & Configuration

Never commit API keys, `.env`, `config.local.json`, or private history. Review untracked presentation materials before staging. Static files are served only from `public/`; protected generation, history, assets, and reports require a session, while config read/write requires an administrator ID from `MUSHENG_ADMIN_USER_IDS`. Keep the allowlist empty until the intended account is registered and verified.
