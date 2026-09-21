import { useTheme } from "@/hooks/useTheme";

// Brand mark mirrors the www favicon.svg: green rounded square with a white
// broken-ring arc rotated -40 degrees.
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

export function PingPage() {
  const { theme, toggle } = useTheme();
  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="bg-card text-card-foreground border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandMark className="h-7 w-7" />
            <span className="text-xl font-bold tracking-tight">OpenSCORM</span>
          </div>
          <span className="text-muted-foreground font-mono text-xs">{version}</span>
        </div>
        <p className="text-foreground mb-1">Phase 0 pipeline live.</p>
        <p className="text-muted-foreground mb-8 text-sm">
          React SPA served at the site root; API under /api; both on app.openscorm.com.
        </p>
        <div className="grid">
          <button
            type="button"
            onClick={toggle}
            className="border-border hover:bg-muted inline-flex items-center justify-center rounded-full border bg-transparent px-6 py-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[rgb(22_163_74)] focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Switch to {theme === "dark" ? "light" : "dark"} mode
          </button>
        </div>
      </div>
    </main>
  );
}
