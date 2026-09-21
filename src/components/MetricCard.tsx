import { Link } from "react-router-dom";
import { CircleHelp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// The stat tile shared by both dashboards, unifying the two MetricCard copies
// that had drifted (DashboardPage's plain {label,value} and
// OperatorDashboardPage's {label,value?,to?,hint?}). The optional hint renders
// through the ui/tooltip primitive, replacing OperatorDashboard's hand-rolled
// CSS popover.
export function MetricCard({
  label,
  value,
  to,
  hint,
}: {
  label: string;
  value?: number;
  to?: string;
  hint?: string;
}) {
  const display = value?.toLocaleString() ?? "–";
  return (
    <Card className="p-5">
      <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs tracking-wide uppercase">
        {label}
        {hint && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                aria-label={`What counts as ${label.toLowerCase()}`}
                className="text-muted-foreground/60 hover:text-foreground focus-visible:ring-primary rounded-full focus-visible:ring-2 focus-visible:outline-none"
              >
                <CircleHelp className="h-3.5 w-3.5 shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="w-56 font-normal tracking-normal normal-case">
                {hint}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="text-3xl font-bold tabular-nums">
        {to && value !== undefined ? (
          <Link to={to} className="text-link hover:underline">
            {display}
          </Link>
        ) : (
          display
        )}
      </div>
    </Card>
  );
}
