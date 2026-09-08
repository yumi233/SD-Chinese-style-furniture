# Web Asset Inventory

## Update: 2026-09-08

Root presentations, ZIP exports, Python authoring scripts, slide text and defense
notes are now archived under `local-archive/root-materials/`, preserving names.
Git and Docker exclusions now cover that archive, deliverables, references,
extracted media, previews and local app data. The unignored-output findings in
the 2026-09-07 snapshot below are historical and superseded by this update.
The host Gemini worker Git exception remains intentional; it is excluded from
Docker. See [organization rules](ORGANIZATION.md) and [document index](README.md).

This repository tracks the public web application and the assets needed to run
or review that application. Private submission packages, source application
materials, local runtime output, and generated history stay local.

## Tracked web assets

- `assets/musheng-ai-logo.png` and `assets/musheng-ai-logo-original.png`: brand
  logo files for the MuSheng AI interface.
- `assets/style-*.png`: curated Chinese furniture style examples used by the
  frontend.
- `index.html`, `styles.css`, and `script.js`: browser interface for the web
  app.
- `server.js` and `src/`: local Express gateway, model adapters, history store,
  and report helpers used by the web app.
- `.env.example` and `config.local.example.json`: safe configuration templates
  without local secrets.
- `Dockerfile`, `docker-compose.yml`, `docker-compose.auto-update.yml`,
  `docker-compose.local.yml`, and `.dockerignore`: Docker packaging for
  one-command local web app startup, automatic updates, and local builds.
- `test/`: regression tests for the frontend bindings, gateway, model config,
  history, and request normalization.

## Local-only files

- `.env` and `config.local.json`: local model endpoints and runtime settings.
- `.codex/`: local Codex workspace metadata.
- `data/history/`: generated image history saved while running the local app.
- `assets/generated/`: archived generated images from prior local sessions.
- `docs/source/`: private project source materials and application documents.
- `submit_materials/`: competition submission packages and attachments.
- `tools/`: local submission and media build helpers.
- `tmp/`, `*.log`, and root-level `*.zip`: temporary build or export artifacts.

Before publishing, use `git status --ignored --short` to confirm only public web
application files are staged.

## Workspace inventory snapshot (2026-09-07)

This snapshot describes local files, not a new release or a content-level privacy
audit. Counts include nested files; sizes are in MiB. No private configuration
values or document contents were read for this inventory.

| Asset group | Location | Inventory | Publication boundary |
| --- | --- | --- | --- |
| Web interface | `index.html`, `styles.css`, `script.js` | 3 entry files | Public application |
| Web backend | `server.js`, `src/` | Server entry and 13 source files | Public application |
| Brand and style images | Top level of `assets/` | 2 logos and 4 style examples, about 2.66 MiB | Already tracked |
| Regression tests | `test/` | 7 test files | Public development assets |
| Docker delivery | `Dockerfile`, 3 Compose files, `.dockerignore`, workflow | Image build, persistent data volume, GHCR publication and optional Watchtower | Public deployment assets |
| Documentation | `README.md`, `docs/`, `AGENTS.md` | Installation, usage, release rules, file map, architecture and handover; some additions remain untracked | Review web-related additions before publication |
| Submission materials | `submit_materials/` | 41 files, 566.70 MiB; documents, spreadsheets, video, presentations, source archive and images | Local only; ignored |
| Original project documents | `docs/source/` | 2 files, 23.83 MiB | Local only; ignored |
| Archived generated images | `assets/generated/` | 7 files, 12.20 MiB | Local only; ignored |
| Runtime history | `data/history/` | 8 files, 13.78 MiB | Local only; ignored |
| Team handover presentation | `deliverables/` | 1 PPTX, 1.13 MiB | Local only pending review; not currently ignored |
| Reference images | `references/` | 3 PNGs, 3.04 MiB | Local only pending review; not currently ignored |
| Extracted presentation media | `extracted_media/` | 23 files, 99.62 MiB | Local only pending review; not currently ignored |
| Presentation previews | `slide_previews/` | Empty at inventory time | Local output |
| Root presentations and archives | Repository root | 2 named defense PPTX variants, 1 test PPTX, 2 ZIP archives, reconstruction notes and slide text dump | Local only; ZIPs ignored, other listed outputs not currently ignored |
| Authoring and worker utilities | Root Python scripts and `tools/` | Presentation helpers and local Gemini worker; recursive tools count includes dependencies | Host-only tooling, not web runtime |
| Configuration and caches | `.env`, `config.local.json`, `.codex/`, `.localappdata/`, dependency/cache folders and logs | Local settings and replaceable runtime files | Never publish secrets or local metadata |

The `assets/` total is 13 files / 14.86 MiB and includes `assets/generated/`;
do not add both totals. File totals do not establish unique asset counts:
submission bundles and extracted media can contain copies of other assets.
Presentation variants have not been opened or compared, so no final version is
designated by this inventory.

## Publication status and outstanding boundaries

- Local HEAD is `ec3c43b` (`Add Docker auto-update compose`). The working tree
  contains subsequent documentation and ignore-rule changes plus untracked files;
  these must not be treated as already published.
- `.gitignore` currently leaves `deliverables/`, `references/`,
  `extracted_media/`, `.localappdata/`, root PPTX files and root authoring outputs
  unignored. Untracked does not mean protected against a future `git add .`.
- The current `tools/*` rule explicitly allows `tools/gemini-worker/`; therefore
  the earlier local-only tools policy is not fully enforced by Git ignore rules.
- `.dockerignore` also lacks exclusions for the newly added presentation and
  reference directories and root authoring outputs. Since the Dockerfile uses
  `COPY . .`, a local build can include them even when they are untracked by Git.
- Docker configuration exists for GHCR and Watchtower's 300-second polling.
  This inventory does not verify remote image availability or container operation.
- Before the next release, resolve the above exclusions, review only the intended
  staged paths, and keep Docker packaging aligned with the public web boundary.
  This inventory update itself does not move, delete, stage or publish assets.
