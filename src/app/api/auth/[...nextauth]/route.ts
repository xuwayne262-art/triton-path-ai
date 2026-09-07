import { handlers } from "@/auth";

/**
 * Auth.js endpoints: the sign-in redirect, the Google callback, session reads
 * and sign-out. The middleware allowlists /api/auth/ so the callback can land
 * before a session exists.
 */
export const { GET, POST } = handlers;
