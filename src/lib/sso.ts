import { api } from "@/lib/api";

// Home realm discovery: asking the server whether an address
// belongs to an organization that signs in through its own identity provider.
export interface SsoDiscovery {
  // A path on this origin that starts the SAML flow, or null when the address
  // is not federated. A path rather than an absolute URL, so the answer stays
  // right whichever origin serves the API.
  signInPath: string | null;
}

// Whether an address is complete enough to be worth asking about. Discovery
// keys on the domain, so anything without a dotted domain after the "@" can
// only ever answer null, and asking anyway spends a request per keystroke on a
// question we already know the answer to.
export function isDiscoverable(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at <= 0) return false;

  const domain = email.slice(at + 1);
  return (
    domain.length > 2 && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".")
  );
}

export async function discoverSso(email: string): Promise<SsoDiscovery> {
  return api<SsoDiscovery>(`/api/auth/saml/discover?email=${encodeURIComponent(email)}`);
}
