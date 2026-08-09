import { createClient } from '@nhost/nhost-js';

const subdomain: string = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'ronqbmjmmogmskjtfjym';
const region: string = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1';

export const nhost = createClient({
  subdomain,
  region,
});
