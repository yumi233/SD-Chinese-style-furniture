# Web Asset Inventory

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
