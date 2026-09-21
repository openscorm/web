import { forwardRef, useState, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type PasswordInputProps = InputHTMLAttributes<HTMLInputElement>;

// Single password field with a show/hide reveal toggle. Revealing the
// value is what catches the typo the confirm-password field used to, so signup
// drops the confirm field entirely. Forwards the ref and props so it drops into
// react-hook-form's register() spread in place of a bare <input>.
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [revealed, setRevealed] = useState(false);
    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          type={revealed ? "text" : "password"}
          className={cn(className, "pr-16")}
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center px-4 text-sm"
          aria-label={revealed ? "Hide password" : "Show password"}
          aria-pressed={revealed}
          tabIndex={-1}
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>
    );
  },
);
