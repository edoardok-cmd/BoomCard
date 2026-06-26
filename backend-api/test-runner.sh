#!/bin/bash
# Check if tests can at least be parsed and syntax is valid
npx tsc --noEmit tests/bc-admin-spec-reaudit-sa-guard-races.test.ts 2>&1 | head -50
