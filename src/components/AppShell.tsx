import { useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleUser, Lock } from "lucide-react";

import { EnvironmentBadge, EnvironmentRule } from "@/components/EnvironmentBadge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { tierLabel } from "@/lib/tiers";
import type { MeResponse } from "@/lib/types";

// Auth-gated wrapper for admin surfaces (Phase 2+). Sidebar mirrors the plan
// doc: Dashboard / Library / Users / Billing / Operator. Session B fills in
// the placeholder routes; Session A ships only Dashboard as a real page.
export function AppShell({
  children,
  align = "center",
}: {
  children: ReactNode;
  // Content-well alignment. Centered by default; search and detail pages pass
  // "left" to sit flush-left within the width cap.
  align?: "center" | "left";
}) {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();

  if (loading) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" });
    await qc.invalidateQueries({ queryKey: ["auth", "me"] });
    nav("/login");
  };

  const isManager = user.isManager || user.isOperator;
  const home = isManager ? "/dashboard" : "/courses";
  const navItems = isManager
    ? [
        { to: "/dashboard", label: "Dashboard" },
        { to: "/library", label: "Library" },
        // Dispatch hides entirely where the environment switches it off
        // On Free it stays visible but gated: the entry
        // carries a lock chip and RequireDispatch routes it to the upgrade
        // landing instead of the console. Either way the route guard, not the
        // hidden nav item, is what a typed URL runs into.
        ...(user.dispatchEnabled || user.dispatchGated
          ? [{ to: "/dispatch", label: "Dispatch" }]
          : []),
        { to: "/accounts", label: "Accounts" },
        { to: "/reports", label: "Reports" },
        { to: "/billing", label: "Billing" },
        // Last, and deliberately apart from Library. Library is the tenant's
        // courses as a manager administers them; this is the same person as a
        // learner, and it is the page the player exits to - unreachable from
        // the chrome until now unless you typed the URL.
        { to: "/courses", label: "My courses" },
      ]
    : [{ to: "/courses", label: "My courses" }];

  return (
    // Column rather than row now: the environment rule sits above every piece
    // of chrome, including the sidebar, so it reads as a property of the whole
    // application rather than of one panel.
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <EnvironmentRule environment={user.environment} />
      <ImpersonationBanner user={user} />
      <VerifyEmailBanner />

      <div className="flex min-h-0 flex-1">
        <aside className="border-border flex w-56 shrink-0 flex-col border-r">
          {/* Same height as the topbar, so the rule under the brand and the
              rule under the header form one continuous line across the top of
              the app rather than meeting in a broken corner. Both
              carry h-12; changing one without the other reopens the defect. */}
          <div className="border-border flex h-12 shrink-0 items-center justify-between border-b px-4">
            <Link to={home} className="flex items-center gap-2 text-lg font-bold">
              <BrandMark className="h-6 w-6" />
              <span>OpenSCORM</span>
            </Link>
            <ThemeToggle className="-mr-1.5" />
          </div>

          <nav className="flex-1 space-y-1 p-2">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`
                }
              >
                {n.label}
                {n.to === "/dispatch" && user.dispatchGated && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 align-middle text-[10px] font-medium text-green-800 dark:bg-green-950/50 dark:text-green-300">
                    <Lock className="h-2.5 w-2.5" />
                    Paid
                  </span>
                )}
              </NavLink>
            ))}
            {user.isOperator && (
              <>
                <div className="text-muted-foreground/70 px-3 pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">
                  Operators only
                </div>
                {[
                  { to: "/operator/dashboard", label: "Dashboard" },
                  { to: "/operator/accounts", label: "Accounts" },
                  { to: "/operator/tenants", label: "Tenants" },
                ].map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    className={({ isActive }) =>
                      `block rounded-lg px-3 py-2 text-sm ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`
                    }
                  >
                    {n.label}
                  </NavLink>
                ))}
              </>
            )}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} onSignOut={signOut} />
          <main className="flex-1 overflow-auto">
            <div
              className={
                align === "center" ? "mx-auto max-w-[80rem] px-6 py-8" : "max-w-[80rem] px-6 py-8"
              }
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

// Full width, above every other piece of chrome, and impossible to dismiss.
// An impersonated session writes real learner data, including completion
// records that are a compliance customer's audit evidence, so the one thing
// this must never do is let an operator forget whose account they are in.
function ImpersonationBanner({ user }: { user: MeResponse }) {
  const [stopping, setStopping] = useState(false);
  if (!user.impersonatedBy) return null;

  const stop = async () => {
    setStopping(true);
    let destination = "/login";
    try {
      // The server returns where to land, because it knows whether the
      // operator's own session was still alive to restore. "/" is never the
      // answer: it redirects to /login for everyone, so a successful restore
      // would look like a sign-out.
      const result = await api<{ restored: boolean; redirect: string }>(
        "/api/auth/impersonate/stop",
        { method: "POST" },
      );
      destination = result.redirect ?? "/dashboard";
    } finally {
      // Full reload either way: the cookie changed, so every cached query in
      // memory describes the wrong person.
      window.location.href = destination;
    }
  };

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-sm text-black"
    >
      <span>
        You are acting as <span className="font-semibold">{user.name}</span>
        {user.email ? ` (${user.email})` : ""}. Anything you do is recorded against them.
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={stopping}
        className="rounded-lg bg-black/85 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
      >
        {stopping ? "Stopping…" : "Stop impersonating"}
      </button>
    </div>
  );
}

function Topbar({ user, onSignOut }: { user: MeResponse; onSignOut: () => void }) {
  return (
    // h-12 is shared with the sidebar brand block so the two bottom rules meet
    // cleanly at the top-left corner of the content area.
    <header className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <EnvironmentBadge environment={user.environment} />

      <div className="ml-auto flex items-center gap-1">
        <UserMenu user={user} onSignOut={onSignOut} />
      </div>
    </header>
  );
}

function UserMenu({ user, onSignOut }: { user: MeResponse; onSignOut: () => void }) {
  const nav = useNavigate();
  // Falls back through what the session actually carries. Immediately after
  // login the SPA holds the register/login payload, where tenant fields are
  // empty until the follow-up /me resolves them, so nothing here may assume a
  // field is present.
  const displayName = user.name || user.email || "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:bg-muted text-muted-foreground hover:text-foreground flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm">
        <CircleUser className="h-4 w-4" aria-hidden="true" />
        <span className="hidden max-w-40 truncate sm:inline">{displayName}</span>
        <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate font-medium">{displayName}</div>
          {user.email && (
            <div className="text-muted-foreground truncate text-xs font-normal">{user.email}</div>
          )}
          {user.tenantHandle && (
            <div className="text-muted-foreground/70 mt-1 truncate text-xs font-normal">
              <span className="font-mono">{user.tenantHandle}</span> · {tierLabel(user.tenantType)}
            </div>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => nav("/settings")}>Settings</DropdownMenuItem>
        <DropdownMenuItem onSelect={onSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="512" height="512" rx="96" fill="rgb(22 163 74)" />
      <circle
        cx="256"
        cy="260"
        r="130"
        fill="none"
        stroke="white"
        strokeWidth="58"
        strokeLinecap="round"
        strokeDasharray="740 77"
        transform="rotate(-40 256 260)"
      />
    </svg>
  );
}
