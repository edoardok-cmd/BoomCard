export {};

// Augment express-serve-static-core (the underlying module Express's Request comes from)
// to add audit-middleware override fields available on plain Express Request objects.
//
// This is the single canonical source for these four fields (BC-QA-060-FOLLOWUP-1).
// They are set/read by src/middleware/audit.middleware.ts (auditMiddleware, writeAudit)
// and overridden by individual route handlers (e.g. src/routes/adminAdmins.routes.ts,
// src/routes/adminTransactions.routes.ts) to customise or suppress the auto-logged
// audit entry for a given request. Do not re-declare these fields in another file —
// a second, independently-maintained copy previously lived inline in
// audit.middleware.ts and is exactly the kind of drift that lets this declaration
// go stale without either copy erroring.
declare module 'express-serve-static-core' {
  interface Request {
    skipAudit?: boolean;
    auditAction?: string;
    auditObjectType?: string;
    auditObjectId?: string | null;
  }
}
