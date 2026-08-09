/**
 * Organization Call Quota Management
 * Checks and increments API usage quotas for tenant organizations.
 */

export interface QuotaCheckResult {
  hasQuota: boolean;
  callsUsed: number;
  callsAllowed: number;
  callsRemaining: number;
}

function getGraphqlEndpoint(): string {
  if (process.env.NHOST_GRAPHQL_URL) {
    return process.env.NHOST_GRAPHQL_URL;
  }
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || '';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'us-east-1';
  if (subdomain) {
    return `https://${subdomain}.graphql.${region}.nhost.run/v1/graphql`;
  }
  return '';
}

function getRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (adminSecret) {
    headers['x-hasura-admin-secret'] = adminSecret;
  }
  return headers;
}

/**
 * Checks an organization's current calls_used against calls_allowed.
 * Rejects execution when the quota is exhausted.
 */
export async function checkOrgQuota(orgId: string): Promise<QuotaCheckResult> {
  const endpoint = getGraphqlEndpoint();
  if (!endpoint) {
    console.warn('[Quota] GraphQL endpoint not configured. Assuming default quota check.');
    return { hasQuota: true, callsUsed: 0, callsAllowed: 1000, callsRemaining: 1000 };
  }

  const query = `
    query GetOrgQuota($orgId: uuid!) {
      organizations_by_pk(id: $orgId) {
        calls_used
        calls_allowed
      }
    }
  `;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({ query, variables: { orgId } }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`);
    }

    const result = await response.json();
    const org = result?.data?.organizations_by_pk;

    if (!org) {
      throw new Error(`Organization with ID ${orgId} not found.`);
    }

    const callsUsed = org.calls_used ?? 0;
    const callsAllowed = org.calls_allowed ?? 1000;
    const callsRemaining = Math.max(callsAllowed - callsUsed, 0);
    const hasQuota = callsUsed < callsAllowed;

    return {
      hasQuota,
      callsUsed,
      callsAllowed,
      callsRemaining,
    };
  } catch (error) {
    console.error('[Quota] Error checking organization quota:', error);
    // In case of transient DB fetch failure, default to quota check error
    throw new Error(`Failed to verify organization quota: ${(error as Error).message}`);
  }
}

/**
 * Increments an organization's calls_used counter after a successful workflow run.
 */
export async function incrementOrgQuota(orgId: string): Promise<{ callsUsed: number; callsAllowed: number }> {
  const endpoint = getGraphqlEndpoint();
  if (!endpoint) {
    return { callsUsed: 0, callsAllowed: 1000 };
  }

  const mutation = `
    mutation IncrementQuota($orgId: uuid!) {
      update_organizations_by_pk(
        pk_columns: { id: $orgId },
        _inc: { calls_used: 1 }
      ) {
        calls_used
        calls_allowed
      }
    }
  `;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({ query: mutation, variables: { orgId } }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL mutation failed: ${response.statusText}`);
    }

    const result = await response.json();
    const org = result?.data?.update_organizations_by_pk;

    return {
      callsUsed: org?.calls_used ?? 0,
      callsAllowed: org?.calls_allowed ?? 1000,
    };
  } catch (error) {
    console.error('[Quota] Error incrementing organization quota:', error);
    return { callsUsed: 0, callsAllowed: 1000 };
  }
}
