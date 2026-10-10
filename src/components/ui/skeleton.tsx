import { cn } from "@/lib/cn";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("bg-muted animate-pulse rounded-md", className)} {...props} />;
}
