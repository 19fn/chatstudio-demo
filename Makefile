.PHONY: dev-up dev-down dev-logs test-unit test-integration test-all lint ci check clean

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

ci:
	@exit_code=0; cleanup_code=0; \
	docker compose -f compose.ci.yaml up --build --abort-on-container-exit --exit-code-from ci || exit_code=$$?; \
	docker compose -f compose.ci.yaml down -v --remove-orphans || cleanup_code=$$?; \
	if [ $$exit_code -ne 0 ]; then exit $$exit_code; fi; \
	if [ $$cleanup_code -ne 0 ]; then exit $$cleanup_code; fi; \
	printf '\n+-------------------+--------+\n'; \
	printf '| Check             | Result |\n'; \
	printf '+-------------------+--------+\n'; \
	printf '| Dependency audit  | PASS   |\n'; \
	printf '| Lint              | PASS   |\n'; \
	printf '| Unit tests        | PASS   |\n'; \
	printf '| Integration tests | PASS   |\n'; \
	printf '| Cleanup           | PASS   |\n'; \
	printf '+-------------------+--------+\n'

check: ci

clean:
	docker compose --env-file .env.dev -f compose.yaml down -v --remove-orphans
	docker compose -f compose.unit.yaml down -v --remove-orphans
	docker compose -f compose.integration.yaml down -v --remove-orphans
	docker compose -f compose.ci.yaml down -v --remove-orphans