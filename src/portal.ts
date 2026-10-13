import type { Role } from './domain';

// A URL chooses the workspace UI; actual account permissions remain server-side.
export function portalRole(pathname: string): Role {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/owner' ? 'owner' : path === '/admin' ? 'admin' : 'customer';
}

export function portalPath(role: Role): string {
  return role === 'customer' ? '/' : `/${role}`;
}
