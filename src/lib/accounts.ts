// Shared shape for an operator account summary, used by the cross-tenant
// account list and the account grid on the tenant detail page so the two render
// the same data the same way. Both come from OperatorAccountsResponse.

export interface AccountRow {
  tenantHandle: string;
  accountKey: number;
  email: string;
  name: string;
  isActive: boolean;
  isOperator: boolean;
  isManager: boolean;
  isLearner: boolean;
  createdAt: string;
  authenticatedAt: string | null;
}

export interface AccountsResponse {
  page: number;
  pageSize: number;
  total: number;
  accounts: AccountRow[];
}

// Roles are orthogonal, so an account can carry any combination of the three
// and the label lists every one it holds. isOperator is optional so the shape
// also covers a learner-detail account, whose payload carries no operator flag.
export function roleLabel(a: {
  isOperator?: boolean;
  isManager: boolean;
  isLearner: boolean;
}): string {
  const roles = [];
  if (a.isOperator) roles.push("Operator");
  if (a.isManager) roles.push("Manager");
  if (a.isLearner) roles.push("Learner");
  return roles.join(", ") || "None";
}

// Both operator account grids page at 20 rows.
export const ACCOUNT_PAGE_SIZE = 20;

// Whitelisted server-side; see OperatorController.ListTenantAccounts.
export type AccountSort = "name" | "created";
