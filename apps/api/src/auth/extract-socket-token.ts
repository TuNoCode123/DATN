import { Socket } from 'socket.io';
import { extractBearerToken } from './extract-bearer-token';

/**
 * Reads the Identity Platform ID token from a Socket.IO handshake.
 *
 * Replaces reading the ALB-injected `x-amzn-oidc-data` header — there's no
 * load balancer to inject anything now, so the frontend must attach the
 * token itself. Primary path is Socket.IO's own `auth` payload
 * (`io(url, { auth: { token } })`), which is the idiomatic way to pass
 * per-connection credentials; an `Authorization: Bearer <token>` header is
 * accepted too, for parity with the HTTP guards.
 */
export function extractSocketToken(socket: Socket): string | undefined {
  const authToken = (socket.handshake.auth as Record<string, unknown> | undefined)
    ?.token;
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }
  return extractBearerToken(
    socket.handshake.headers['authorization'] as string | undefined,
  );
}
