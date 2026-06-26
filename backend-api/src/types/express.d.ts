export {};

// Augment express-serve-static-core (the underlying module Express's Request comes from)
// to add audit-middleware override fields available on plain Express Request objects.
declare module 'express-serve-static-core' {
  interface Request {
    skipAudit?: boolean;
    auditAction?: string;
    auditObjectType?: string;
    auditObjectId?: string | null;
  }
}
