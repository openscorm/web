import { useTheme } from "@/hooks/useTheme";

// One theme control for every surface: the lobby chrome (login, register,
// forgot, reset, enroll) and the authenticated shell. Geometry mirrors the
// www marketing site header toggle - p-2.5, rounded-lg, a 24px icon dropping
// to 20px from md up - so the control does not resize or move as a visitor
// crosses from www.openscorm.com into the app.
//
// One deliberate difference from www: www renders a static sun in both modes,
// while this swaps sun and moon with the current theme so the icon shows what
// the click will do. Focus styling follows the app convention (focus-visible
// ring on the primary token) rather than www's focus:ring-4, since that only
// shows for keyboard users and the app is internally consistent about it.
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-primary inline-flex items-center rounded-lg p-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none ${className}`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

const ICON_SIZE = "h-6 w-6 md:h-5 md:w-5";

// tabler:sun, the same icon and icon set the www header uses.
function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON_SIZE}
      aria-hidden="true"
    >
      <path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0m-5 0h1m8-9v1m8 8h1m-9 8v1M5.6 5.6l.7.7m12.1-.7l-.7.7m0 11.4l.7.7m-12.1-.7l-.7.7" />
    </svg>
  );
}

// tabler:moon, the companion to the sun above from the same set.
function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON_SIZE}
      aria-hidden="true"
    >
      <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
    </svg>
  );
}
