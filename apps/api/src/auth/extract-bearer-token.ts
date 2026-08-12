/** Reads a bearer token from an `Authorization: Bearer <token>` header value. */
export function extractBearerToken(
  authorizationHeader: string | string[] | undefined,
): string | undefined {
  const header = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }
  return undefined;
}
