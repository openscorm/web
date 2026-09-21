// The backend tenant_type value "Trial" is our internal name for the free tier.
// Customers see "Free" on every learner- and manager-facing surface; operator
// and staff surfaces keep the raw type. This is the single place that maps the
// display label for the SPA, so its customer-facing sites stay in agreement.
// Do not rename the TenantType.Trial enum or the tenant_type='Trial' value:
// those are catalog- and DB-bound and far larger than a display fix.
// The API boundary has the same map in C#: TenantTypes.CustomerFacingLabel.
// The two must agree; they are the only two places the label is decided.
export function tierLabel(tenantType: string): string {
  return tenantType === "Trial" ? "Free" : tenantType;
}
