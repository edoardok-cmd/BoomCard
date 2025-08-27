.PHONY: help install dev build test clean

help: ## Show help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm install

dev: ## Start development
	docker-compose up -d postgres redis
	npm run dev

build: ## Build all apps
	npm run build

test: ## Run tests
	npm test

clean: ## Clean build artifacts
	rm -rf dist/ build/ .next/ out/
	find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
