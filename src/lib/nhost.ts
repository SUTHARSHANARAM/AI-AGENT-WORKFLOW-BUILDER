import { createClient, type NhostClient } from '@nhost/nhost-js';

const subdomain: string = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || '';
const region: string = process.env.NEXT_PUBLIC_NHOST_REGION || '';

/**
 * Reusable TypeScript-safe Nhost Client for Next.js.
 * Utilizes public environment variables NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION.
 */
export const nhost: NhostClient = createClient({
  subdomain,
  region,
});
