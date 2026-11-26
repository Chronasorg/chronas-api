const ADMIN_PRIVILEGE = 5;

/**
 * Admin check. A Patreon subscription does not count: since 2026-11-26 every
 * authenticated route is for admins only (server/helpers/require-auth.js).
 */
function isAdmin(auth) {
  return Boolean(auth && Number(auth.privilege) >= ADMIN_PRIVILEGE);
}

export default { isAdmin };
