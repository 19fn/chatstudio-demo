.PHONY: dev-up dev-down dev-logs test-unit test-integration test-all lint check clean

dev-up:
	docker compose --env-file .env.dev up --build -d

dev-down:
	docker compose --env-file .env.dev down --remove-orphans

dev-logs:
	docker compose --env-file .env.dev logs -f app

test-unit:
	@exit_code=0; cleanup_code=0; \
	docker compose -f compose.unit.yaml up --build --abort-on-container-exit --exit-code-from unit || exit_code=$$?; \
	docker compose -f compose.unit.yaml down -v --remove-orphans || cleanup_code=$$?; \
	if [ $$exit_code -ne 0 ]; then exit $$exit_code; fi; \
	exit $$cleanup_code

test-integration:
	@exit_code=0; cleanup_code=0; \
	docker compose -f compose.integration.yaml up --build --abort-on-container-exit --exit-code-from integration || exit_code=$$?; \
	docker compose -f compose.integration.yaml down -v --remove-orphans || cleanup_code=$$?; \
	if [ $$exit_code -ne 0 ]; then exit $$exit_code; fi; \
	exit $$cleanup_code

test-all: test-unit test-integration

lint:
	npm run lint

check: lint test-all

clean:
	docker compose --env-file .env.dev -f compose.yaml down -v --remove-orphans
	docker compose -f compose.unit.yaml down -v --remove-orphans
	docker compose -f compose.integration.yaml down -v --remove-orphans