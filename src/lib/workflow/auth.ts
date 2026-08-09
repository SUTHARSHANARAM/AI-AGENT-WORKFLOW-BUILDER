import { OrgRole } from './types';

/**
 * Role hierarchy weights for authorization checks.
 * owner (3) > editor (2) > viewer (1)
 */
const ROLE_WEIGHTS: Record<OrgRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

/**
 * Asserts whether a user's role satisfies any of the required roles or higher privilege.
 * For instance, an 'owner' automatically satisfies an 'editor' requirement.
 */
export function assertRole(userRole: OrgRole, requiredRoles: OrgRole[]): boolean {
  if (!userRole || !requiredRoles || requiredRoles.length === 0) {
    return false;
  }

  // Exact match
  if (requiredRoles.includes(userRole)) {
    return true;
  }

  // Privilege hierarchy check: if user role weight is higher than or equal to the minimum required role weight
  const userWeight = ROLE_WEIGHTS[userRole] || 0;
  const minRequiredWeight = Math.min(...requiredRoles.map((r) => ROLE_WEIGHTS[r] || 99));

  return userWeight >= minRequiredWeight;
}

/**
 * Server-side function to verify a user's organization membership and retrieve their role.
 * Queries Nhost/Hasura GraphQL backend securely server-side.
 */
export async function verifyOrgMember(
  userId: string,
  orgId: string
): Promise<{ role: OrgRole | null; allowed: boolean }> {
  if (!userId || !orgId) {
    return { role: null, allowed: false };
  }

  const graphqlUrl = process.env.NHOST_GRAPHQL_URL ||
    (process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN
      ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.hasura.${process.env.NEXT_PUBLIC_NHOST_REGION || 'us-east-1'}.nhost.run/v1/graphql`
      : '');

  const adminSecret = process.env.NHOST_ADMIN_SECRET || '';

  if (!graphqlUrl) {
    console.warn('[Workflow Auth] GraphQL URL not configured.');
    return { role: null, allowed: false };
  }

  const query = `
    query VerifyMember($orgId: uuid!, $userId: uuid!) {
      org_members(where: { org_id: { _eq: $orgId }, user_id: { _eq: $userId } }) {
        role
      }
    }
  `;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (adminSecret) {
      headers['x-hasura-admin-secret'] = adminSecret;
    } else {
      headers['x-hasura-role'] = 'user';
      headers['x-hasura-user-id'] = userId;
    }

    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { orgId, userId },
      }),
    });

    if (!response.ok) {
      console.error('[Workflow Auth] GraphQL verify request failed:', response.statusText);
      return { role: null, allowed: false };
    }

    const result = await response.json();
    const members = result?.data?.org_members || [];

    if (members.length === 0) {
      return { role: null, allowed: false };
    }

    const role = members[0].role as OrgRole;
    return { role, allowed: true };
  } catch (error) {
    console.error('[Workflow Auth] Error verifying org membership:', error);
    return { role: null, allowed: false };
  }
}
