const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Prisma crashes with P2023 ("Error creating UUID") when a non-UUID string is
 * passed to a UUID column. Callers that hit API routes with synthetic ids
 * (e.g. workspace ids like "plan-1788155112499") must be turned away with a
 * plain 404 before touching the database.
 */
export function isUuid(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}
