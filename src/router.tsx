import { createBrowserRouter, Navigate } from "react-router-dom";
import { PingPage } from "@/routes/PingPage";
import { LoginPage } from "@/routes/LoginPage";
import { SettingsPage } from "@/routes/SettingsPage";
import { RegisterPage } from "@/routes/RegisterPage";
import { ForgotPasswordPage } from "@/routes/ForgotPasswordPage";
import { ResetPasswordPage } from "@/routes/ResetPasswordPage";
import { VerifyEmailPage } from "@/routes/VerifyEmailPage";
import { EnrollPage } from "@/routes/EnrollPage";
import { DashboardPage } from "@/routes/DashboardPage";
import { AccountsPage } from "@/routes/AccountsPage";
import { AccountDetailPage } from "@/routes/AccountDetailPage";
import { ReportsPage } from "@/routes/ReportsPage";
import { LearnerDetailPage } from "@/routes/LearnerDetailPage";
import { PricingPage } from "@/routes/PricingPage";
import { OperatorTenantsPage } from "@/routes/OperatorTenantsPage";
import { OperatorTenantDetailPage } from "@/routes/OperatorTenantDetailPage";
import { OperatorAccountsPage } from "@/routes/OperatorAccountsPage";
import { OperatorAccountDetailPage } from "@/routes/OperatorAccountDetailPage";
import { OperatorDuplicateAccountsPage } from "@/routes/OperatorDuplicateAccountsPage";
import { OperatorMeterHistoryPage } from "@/routes/OperatorMeterHistoryPage";
import { OperatorMeterReportPage } from "@/routes/OperatorMeterReportPage";
import { OperatorMergeAccountsPage } from "@/routes/OperatorMergeAccountsPage";
import { OperatorDashboardPage } from "@/routes/OperatorDashboardPage";
import { LibraryPage } from "@/routes/LibraryPage";
import { DispatchPage } from "@/routes/DispatchPage";
import { DispatchClientPage } from "@/routes/DispatchClientPage";
import { MyCoursesPage } from "@/routes/MyCoursesPage";
import { CourseDetailPage } from "@/routes/CourseDetailPage";
import { PlayerPage } from "@/routes/PlayerPage";
import { TrustPage } from "@/routes/TrustPage";
import { RequireManager } from "@/components/RequireManager";
import { RequireDispatch } from "@/components/RequireDispatch";
import { RequireOperator } from "@/components/RequireOperator";
import { RedirectToBilling } from "@/components/RedirectToBilling";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/forgot", element: <ForgotPasswordPage /> },
  { path: "/reset", element: <ResetPasswordPage /> },
  { path: "/welcome", element: <ResetPasswordPage variant="welcome" /> },
  { path: "/verify-email", element: <VerifyEmailPage /> },
  { path: "/enroll", element: <EnrollPage /> },
  {
    path: "/dashboard",
    element: (
      <RequireManager>
        <DashboardPage />
      </RequireManager>
    ),
  },
  {
    path: "/library",
    element: (
      <RequireManager>
        <LibraryPage />
      </RequireManager>
    ),
  },
  {
    path: "/dispatch",
    element: (
      <RequireManager>
        <RequireDispatch>
          <DispatchPage />
        </RequireDispatch>
      </RequireManager>
    ),
  },
  {
    path: "/dispatch/:clientKey",
    element: (
      <RequireManager>
        <RequireDispatch>
          <DispatchClientPage />
        </RequireDispatch>
      </RequireManager>
    ),
  },
  { path: "/courses", element: <MyCoursesPage /> },
  {
    path: "/courses/:courseKey",
    element: (
      <RequireManager>
        <CourseDetailPage />
      </RequireManager>
    ),
  },
  { path: "/play/:courseKey", element: <PlayerPage /> },
  {
    path: "/accounts",
    element: (
      <RequireManager>
        <AccountsPage />
      </RequireManager>
    ),
  },
  {
    path: "/accounts/:accountKey",
    element: (
      <RequireManager>
        <AccountDetailPage />
      </RequireManager>
    ),
  },
  // The page lived at /users until 2026-08-13. Kept so bookmarks and any link
  // written down elsewhere still land somewhere useful.
  { path: "/users", element: <Navigate to="/accounts" replace /> },
  {
    path: "/reports",
    element: (
      <RequireManager>
        <ReportsPage />
      </RequireManager>
    ),
  },
  {
    path: "/reports/learners/:accountKey",
    element: (
      <RequireManager>
        <LearnerDetailPage />
      </RequireManager>
    ),
  },
  {
    path: "/billing",
    element: (
      <RequireManager>
        <PricingPage />
      </RequireManager>
    ),
  },
  // Canonical plan page moved to /billing. Old path kept as a
  // query-preserving redirect so a stale Stripe return (/pricing?checkout=...)
  // still lands on the banner. Remove once no /pricing links remain.
  { path: "/pricing", element: <RedirectToBilling /> },
  {
    path: "/operator/dashboard",
    element: (
      <RequireOperator>
        <OperatorDashboardPage />
      </RequireOperator>
    ),
  },
  {
    path: "/operator/tenants",
    element: (
      <RequireOperator>
        <OperatorTenantsPage />
      </RequireOperator>
    ),
  },
  {
    path: "/operator/tenants/:tenantKey",
    element: (
      <RequireOperator>
        <OperatorTenantDetailPage />
      </RequireOperator>
    ),
  },
  {
    path: "/operator/accounts",
    element: (
      <RequireOperator>
        <OperatorAccountsPage />
      </RequireOperator>
    ),
  },
  {
    path: "/operator/reports/duplicate-accounts",
    element: (
      <RequireOperator>
        <OperatorDuplicateAccountsPage />
      </RequireOperator>
    ),
  },
  {
    path: "/operator/reports/meter",
    element: (
      <RequireOperator>
        <OperatorMeterReportPage />
      </RequireOperator>
    ),
  },
  {
    path: "/operator/reports/meter/:tenantKey",
    element: (
      <RequireOperator>
        <OperatorMeterHistoryPage />
      </RequireOperator>
    ),
  },
  {
    path: "/operator/merge-accounts",
    element: (
      <RequireOperator>
        <OperatorMergeAccountsPage />
      </RequireOperator>
    ),
  },
  {
    path: "/operator/accounts/:accountKey",
    element: (
      <RequireOperator>
        <OperatorAccountDetailPage />
      </RequireOperator>
    ),
  },
  { path: "/settings", element: <SettingsPage /> },
  // Public Trust page. Reachable by URL but not yet linked from public chrome
  // or the marketing site.
  { path: "/trust", element: <TrustPage /> },
  { path: "/ping", element: <PingPage /> },
  { path: "*", element: <Navigate to="/login" replace /> },
]);
