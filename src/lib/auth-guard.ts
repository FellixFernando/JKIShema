/**
 * Structural types so this can be used as a NextAuth `authorized` callback and
 * tested with a plain object. Deliberately ignores cookies: only a valid token
 * grants access, so a forged cookie cannot pass.
 */
export interface AuthorizedCallbackParams {
  req: { nextUrl: { pathname: string } }
  token: unknown
}

export function authorizedCallback({ req, token }: AuthorizedCallbackParams): boolean {
  if (req.nextUrl.pathname.startsWith('/admin/login')) {
    return true
  }
  return token != null
}
