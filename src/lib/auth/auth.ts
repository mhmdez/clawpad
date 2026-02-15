export interface RelaySessionUser {
  id?: string;
  email?: string;
  name?: string;
  relayToken?: string;
}

export interface RelaySession {
  user?: RelaySessionUser;
}

/**
 * Placeholder auth helper for Cloud relay settings.
 * This repository currently ships without next-auth runtime dependencies.
 */
export function getRelayTokenFromSession(session?: RelaySession | null): string | null {
  const token = session?.user?.relayToken?.trim();
  return token || null;
}
