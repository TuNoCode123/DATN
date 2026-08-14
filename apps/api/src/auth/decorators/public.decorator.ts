import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as exempt from JwtAuthGuard — for endpoints a browser
 * can't attach an Authorization header to (e.g. a plain <img src>) or
 * that are meant to be reachable before the user logs in. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
