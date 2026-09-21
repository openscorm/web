import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";

// Public-facing page shell for the auth surfaces (login, register, forgot,
// reset, enroll, logout). Chrome matches the www marketing site so moving
// between the two feels like one product.
// Header measurements below are taken from the live www header and should
// stay in step with it: max-w-7xl, px-3 md:px-6, py-3, a 28px mark, and a
// text-2xl md:text-xl wordmark keeping its default line height.
// The 69px height floor is measured, not derived: www's header row is sized
// by its Sign in / Start free pills, which this header does not carry, and
// without the floor the wordmark lands 3px higher than it does on www.
export function LobbyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="bg-background/95 sticky top-0 z-40 w-full backdrop-blur transition-shadow">
        <div className="mx-auto flex min-h-[69px] max-w-[80rem] items-center justify-between gap-4 px-3 py-3 md:px-6">
          <a
            href="https://www.openscorm.com/"
            className="text-foreground inline-flex items-center gap-2 text-2xl font-bold whitespace-nowrap hover:no-underline md:text-xl dark:text-white"
          >
            <BrandMark className="h-7 w-7" />
            <span className="self-center">OpenSCORM</span>
          </a>
          <div className="inline-flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-6 py-12">{children}</main>

      <footer className="border-border text-muted-foreground border-t px-6 py-6 text-sm">
        <div className="mx-auto flex max-w-[80rem] flex-wrap items-center justify-between gap-4">
          <div>
            <a href="https://www.openscorm.com/privacy" className="hover:text-foreground mr-4">
              Privacy
            </a>
            <a href="https://www.openscorm.com/terms" className="hover:text-foreground mr-4">
              Terms
            </a>
            <a href="https://www.openscorm.com/license" className="hover:text-foreground">
              License (AGPL v3)
            </a>
          </div>
          <div>
            &copy; 2025-{new Date().getFullYear()} OpenSCORM. Open source under the GNU AGPL v3
            license.
          </div>
        </div>
      </footer>
    </div>
  );
}

// Brand mark matches the www favicon.svg.
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
