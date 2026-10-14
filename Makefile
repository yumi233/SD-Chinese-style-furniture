SHELL := /bin/sh
COMPOSE ?= docker compose

DEV_COMPOSE ?= $(COMPOSE) -f docker-compose.yml
PROD_COMPOSE ?= $(COMPOSE)
PROD_ENV_FILE ?= .env.production
PROD_VOLUME ?= furniture-ai-data
BACKUP_DIR ?= backups
BACKUP_COMPOSE ?= $(PROD_COMPOSE) --env-file $(PROD_ENV_FILE) -f compose.yaml
PREVIEW_ENV_FILE ?= .env.preview-release
PREVIEW_COMPOSE = $(COMPOSE) --env-file $(PREVIEW_ENV_FILE) -f compose.preview-release.yaml

.PHONY: test check up down build config admin-id prod-config prod-up prod-ps prod-admin-id prod-backup

test:
	npm test

check:
	npm test
	node --check server.js
	node --check src/http/app.js
	node --check src/http/routes.js
	node --check src/http/middleware.js
	node --check src/providers/codexCli.js
	node --check src/generationTasks.js
	node --input-type=module --check < public/js/studio.js
	node --input-type=module --check < public/js/modules/auth-coordinator.js
	node --input-type=module --check < public/js/modules/dialogs.js
	node --input-type=module --check < public/js/modules/workbench.js
	node --input-type=module --check < public/js/modules/designAgent.js

up:
	$(DEV_COMPOSE) up -d

down:
	$(DEV_COMPOSE) down

build:
	$(DEV_COMPOSE) -f docker-compose.local.yml build

config:
	$(DEV_COMPOSE) --env-file .env.example config --quiet

admin-id:
	@test -n "$(EMAIL)" || (echo '用法：make admin-id EMAIL=you@example.com' >&2; exit 2)
	@$(DEV_COMPOSE) exec -T web node src/printAdminId.js "$(EMAIL)"

prod-config:
	$(PROD_COMPOSE) --env-file $(PROD_ENV_FILE) -f compose.yaml --profile '*' config --quiet

prod-up:
	$(PROD_COMPOSE) --env-file $(PROD_ENV_FILE) -f compose.yaml up -d

prod-ps:
	$(PROD_COMPOSE) --env-file $(PROD_ENV_FILE) -f compose.yaml ps

prod-admin-id:
	@test -n "$(EMAIL)" || (echo '用法：make prod-admin-id EMAIL=you@example.com' >&2; exit 2)
	@$(PROD_COMPOSE) --env-file $(PROD_ENV_FILE) -f compose.yaml exec -T web node src/printAdminId.js "$(EMAIL)"

prod-backup:
	@set -eu; \
	  mkdir -p "$(BACKUP_DIR)"; \
	  chmod 700 "$(BACKUP_DIR)"; \
	  docker volume inspect "$(PROD_VOLUME)" >/dev/null; \
	  image="$$($(BACKUP_COMPOSE) config --images | sed -n '1p')"; \
	  test -n "$${image}"; \
	  stamp="$$(date -u +%Y%m%dT%H%M%SZ)"; \
	  name="furniture-ai-$${stamp}.tar.gz"; \
	  docker run --rm --read-only --user "$$(id -u):$$(id -g)" --cap-drop=ALL \
	    --security-opt no-new-privileges:true \
	    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m \
	    -e BACKUP_NAME="$${name}" \
	    -v "$(PROD_VOLUME):/source:ro" \
	    -v "$$(pwd)/$(BACKUP_DIR):/dest" \
	    "$${image}" \
	    sh -ec 'umask 077; tar -C /source -czf "/dest/$${BACKUP_NAME}" .'; \
	  echo "Created $(BACKUP_DIR)/$${name}"

.PHONY: preview-config preview-up preview-ps preview-backup
preview-config:
	$(PREVIEW_COMPOSE) --profile '*' config --quiet

preview-up:
	$(PREVIEW_COMPOSE) up -d --no-build

preview-ps:
	$(PREVIEW_COMPOSE) ps

preview-backup:
	$(MAKE) prod-backup PROD_VOLUME=furniture-ai-local-data 'BACKUP_COMPOSE=$(PREVIEW_COMPOSE)'
