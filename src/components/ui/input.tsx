import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Block, never flex.
 *
 * An input has no children to lay out, so flex changes nothing for a text box - but a date or time
 * input renders its spinner fields and calendar button in a shadow tree the page cannot reach, and
 * Chrome lays that tree out as flex items when the input itself is display:flex. The calendar
 * button then sits hard against the border while the text is inset 12px. Block puts it back inside
 * the padding.
 *
 * Fixing it here rather than in a stylesheet is the point: a rule in @layer base cannot win against
 * a utility class on the element, which is why the first attempt at this did nothing.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "border-border bg-card placeholder:text-muted-foreground focus-visible:ring-primary block h-9 w-full rounded-lg border px-3 py-1 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
