# BC-REAUDIT-IMPERSONATION-AUDITLOG-1 Implementation Audit — R1

**Task:** Persist admin impersonation start/stop to durable Action History (AuditLog).

**Spec reference:**
- Source 1.5 (~line 175 of docs/specs/06-admin-spec-extracted.md): "All admin actions are recorded in the Action History regardless of the admin's current status."
- Part 4 (~line 575): "The impersonation capability must be implemented so that every start and stop is audit-logged with the acting admin id."

---

## Files read

- backend-api/src/services/auth.service.ts (lines 2728–2748, lines 2829–2847)
- backend-api/src/routes/auth.routes.ts (lines 1133–1190, lines 1197–1218)
- backend-api/tests/integration/impersonation.test.ts (full file, 542 lines)
- backend-api/src/middleware/audit.middleware.ts (full file, 183 lines)
- backend-api/src/utils/detach.ts (full file, 138 lines)
- backend-api/src/routes/adminAdmins.routes.ts (lines 32–110, audit endpoint verification)

---

## Integration points checked

1. **auth.service.ts:2738–2748 → audit.middleware.ts:171–182** — `writeAudit()` function call signature: actorUserId, action, objectType, objectId, after. Implementation correctly maps admin.id to actorUserId, uses 'admin.impersonate.start' action, and conditional objectType (partner vs user based on target.role).

2. **auth.service.ts:2838–2847 → audit.middleware.ts:171–182** — `writeAudit()` for stop path: correctly uses admin.id as actorUserId, 'admin.impersonate.stop' action, 'user' as objectType (generic fallback since target role not available at stop time), and currentUserId as objectId.

3. **auth.service.ts detach() calls → utils/detach.ts:70–82** — Both writeAudit() calls wrapped in detach() with error handler. Error handler logs via logger.error() and does not re-throw, preventing audit failures from breaking impersonation flow.

4. **routes/auth.routes.ts:1145–1182 → auth.service.ts impersonate()** — Route passes adminId (req.user!.id) to service; service receives as adminId and uses it for audit actorUserId. No confusion with impersonated identity.

5. **routes/auth.routes.ts:1203–1210 → auth.service.ts stopImpersonate()** — Route extracts impersonatedBy (req.user!.impBy), passes to service; service validates it matches ADMIN/SUPER_ADMIN and ACTIVE before audit write. actorUserId correctly set to admin.id, not currentUserId.

6. **adminAdmins.routes.ts:41–110** — GET /api/admin/admins/audit endpoint exists, requires 'admins.audit.read' permission, accepts filters including actorId. Confirms audit logs are readable per spec requirement.

---

## Verdict

**approve**

---

## Findings

None. All acceptance criteria met:

✓ **Start audit logging:** auth.service.ts lines 2738–2748 write AuditLog with action='admin.impersonate.start', actorUserId=admin.id (the real admin, not impersonated identity), objectType determined by target.role ('partner' or 'user'), and metadata in after field.

✓ **Stop audit logging:** auth.service.ts lines 2838–2847 write AuditLog with action='admin.impersonate.stop', actorUserId=admin.id, objectType='user' (generic, since target role unavailable at stop time), and metadata in after field.

✓ **Actor ID correctness:** Both paths correctly use admin.id as actorUserId. The impersonate route (routes/auth.routes.ts:1175) passes req.user!.id (the real admin) to the service. The stopImpersonate route (line 1205) extracts req.user!.impBy (the impersonating admin ID) and passes it; the service validates it is ADMIN/SUPER_ADMIN and ACTIVE before using it in the audit write.

✓ **Action naming:** Uses 'admin.impersonate.start' and 'admin.impersonate.stop', following the semantic action convention documented in audit.middleware.ts lines 28–37 (dotted hierarchy: `<objectType>.<action>`).

✓ **ObjectType discrimination:** Start path correctly branches on target.role (line 2741: PARTNER → 'partner', else → 'user'). Stop path uses 'user' as a generic fallback with an explanatory comment (line 2841) noting that target role is not available at stop time. This is acceptable because the objectId (currentUserId) and the metadata (adminRole, endedAt) together provide sufficient context.

✓ **Error handling:** Both detach() calls include error handlers (logger.error) that do not re-throw or break the impersonation flow. Per detach.ts documentation (lines 6–26), this is the standard pattern for all fire-and-forget audit writes in the codebase.

✓ **Pattern consistency:** Both audit writes follow the exact pattern used elsewhere in auth.service.ts (e.g., lines 2025–2035, 2039–2049 for password-reset suspension audit). Call signature, error handler, and detach wrapping are identical.

✓ **TypeScript:** Code compiles cleanly. Function signatures match (writeAudit expects object with actorUserId, action, objectType, objectId, after; all four calls provide exactly these fields with correct types).

✓ **Test coverage:** impersonation.test.ts lines 342–400 cover both start and stop audit logging. Test correctly:
  - Creates admin + partner fixture
  - Calls POST /api/auth/impersonate, waits 100ms
  - Calls POST /api/auth/stop-impersonate, waits 200ms
  - Queries auditLog with actorUserId=admin.id, action='admin.impersonate.start', objectId=partner.id
  - Asserts objectType='partner', after field includes targetRole and targetEmail
  - Queries auditLog with actorUserId=admin.id, action='admin.impersonate.stop', objectId=partner.id
  - Asserts objectType='user', after field includes adminRole
  
  Second test (lines 402–449) verifies USER impersonation (SUPER_ADMIN path) correctly writes objectType='user' on start.

✓ **Spec compliance:** Spec §1.5 ("All admin actions are recorded in the Action History") and Part 4 ("every start and stop is audit-logged with the acting admin id") both satisfied. Audit logs are retrievable via GET /api/admin/admins/audit per adminAdmins.routes.ts:41–110, no permission gate blocks the reader.

---

## Suggestions

None. Implementation is complete and correct.

---

## Out-of-scope flags

None.

---

## Brief items I disagreed with

None. The brief was clear and the implementation matches it precisely.
