import { useState } from "react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  restricted?: React.ReactNode[];
  className?: string;
}

export function PageHeader({ title, subtitle, actions, restricted, className }: PageHeaderProps) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const hasRules = restricted !== undefined && restricted.length > 0;

  return (
    <div className={cn("mb-6 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <span>{title}</span>
          {hasRules && (
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              title="View access rules"
              aria-label="View access rules"
              className="text-muted-foreground/70 hover:text-foreground focus-visible:ring-primary rounded p-0.5 focus-visible:ring-2 focus-visible:outline-none"
            >
              <Lock className="h-4 w-4" />
            </button>
          )}
        </h1>
        {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}

      {hasRules && (
        <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Access rules</DialogTitle>
              <DialogDescription>
                Who can see this page, and how the rules are enforced.
              </DialogDescription>
            </DialogHeader>
            <ul className="text-foreground list-disc space-y-2 pl-5 text-sm">
              {restricted.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
