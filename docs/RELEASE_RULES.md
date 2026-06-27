# Release Rules

Docker is the primary runtime for this project. Treat GitHub updates and Docker
updates as the same release path.

## Required rule

Every change pushed to `main` must keep the Docker runtime current:

- `main` pushes run `.github/workflows/docker-image.yml`.
- The workflow runs the Node test suite.
- If tests pass, the workflow builds `Dockerfile`.
- On `main`, the workflow publishes:
  - `ghcr.io/yumi233/sd-chinese-style-furniture:latest`
  - `ghcr.io/yumi233/sd-chinese-style-furniture:sha-<commit>`

If a change touches startup behavior, dependencies, ports, environment
variables, model configuration, history storage, or static assets, update the
Docker files and Docker documentation in the same commit.

## Docker files that must stay aligned

- `Dockerfile`: production image for the Node/Express web app.
- `docker-compose.yml`: normal user path; pulls the latest GHCR image.
- `docker-compose.local.yml`: local source-build override for developers.
- `.dockerignore`: keeps private and local-only files out of Docker builds.
- `docs/INSTALL.md` and `README.md`: user-facing Docker startup instructions.

## GHCR visibility

The first successful workflow run creates the GHCR package. If Docker users need
anonymous pulls, set the package visibility to public in GitHub Packages once.

## Normal Docker usage

```bash
docker compose pull
docker compose up -d
```

## Local Docker build while developing

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```
