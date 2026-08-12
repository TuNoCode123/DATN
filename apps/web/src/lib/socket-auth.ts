import { getIdToken } from './firebase';

/**
 * Socket.IO `auth` option, function form — the client calls this before
 * every connection AND reconnection attempt, so it always sends a fresh
 * ID token rather than one captured once at socket-creation time. This is
 * what makes token expiry transparent across automatic reconnects; no
 * separate manual "refresh and reconnect" dance is needed (see socket.ts's
 * simplified error handler).
 */
export function socketAuthProvider(cb: (data: { token?: string }) => void) {
  getIdToken().then((token) => cb({ token: token ?? undefined }));
}
