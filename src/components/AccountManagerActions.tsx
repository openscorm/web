import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// The two things a tenant's own manager needs on an account and could not do.
//
// PATCH .../accounts/{key} shipped with the accounts page and never had a UI,
// so the only place an account could be edited was the operator console, which
// is ours rather than the customer's: a manager could not correct a name, an
// address or a role without asking us. Reactivate is the missing half of the
// Deactivate that the accounts list has always offered.
//
// Separate from AccountAdminActions on purpose. That component holds the two
// operator-only actions that reach into somebody else's account; these are the
// customer's own administration.
interface AccountManagerActionsProps {
  /** Owning tenant of the target account. */
  tenantKey: number;
  accountKey: number;
  name: string;
  email: string;
  isActive: boolean;
  isManager: boolean;
  isLearner: boolean;
  /** Ran after a successful change, for whatever the host page caches. */
  onChanged?: () => void | Promise<void>;
}

// Same rules and the same words as the create form on the accounts page, so
// adding somebody and editing them refuse the same things identically.
const schema = z
  .object({
    name: z.string().min(1, "Name is required.").max(80),
    email: z.string().min(1, "Email is required.").email("Enter a valid email."),
    isManager: z.boolean(),
    isLearner: z.boolean(),
  })
  .refine((v) => v.isManager || v.isLearner, {
    path: ["isLearner"],
    message: "Pick at least one role.",
  });

type FormValues = z.infer<typeof schema>;

// The account endpoints answer with a problem document, so the useful sentence
// is in detail. The older helper on these pages only handled a string problem,
// which silently swallowed the one message worth showing: that the plan is
// full.
function problemText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (typeof error.problem === "string") return error.problem;
    const problem = error.problem as { detail?: string; title?: string } | undefined;
    if (problem?.detail) return problem.detail;
    if (problem?.title) return problem.title;
  }
  return fallback;
}

export function AccountManagerActions({
  tenantKey,
  accountKey,
  name,
  email,
  isActive,
  isManager,
  isLearner,
  onChanged,
}: AccountManagerActionsProps) {
  const { user } = useAuth();

  const [editOpen, setEditOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name, email, isManager, isLearner },
  });

  // Re-seeded whenever the dialog opens, so it always shows what is stored
  // rather than whatever was typed and abandoned last time.
  useEffect(() => {
    if (editOpen) {
      setServerError(null);
      reset({ name, email, isManager, isLearner });
    }
  }, [editOpen, name, email, isManager, isLearner, reset]);

  const save = useMutation({
    mutationFn: async (values: FormValues) =>
      api<void>(`/api/tenants/${tenantKey}/accounts/${accountKey}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      setEditOpen(false);
      await onChanged?.();
    },
    onError: (error) => setServerError(problemText(error, "Could not save this account.")),
  });

  const reactivate = useMutation({
    mutationFn: async () =>
      api<void>(`/api/tenants/${tenantKey}/accounts/${accountKey}/reactivate`, { method: "POST" }),
    onSuccess: async () => {
      setServerError(null);
      await onChanged?.();
    },
    onError: (error) => setServerError(problemText(error, "Could not reactivate this account.")),
  });

  // The endpoints require manager or operator, so rendering these to a learner
  // only offers a guaranteed 403.
  if (!user?.isManager && !user?.isOperator) return null;

  // Mirrors the server guard: nobody takes their own manager role off, because
  // a tenant's last manager doing that leaves it with nobody able to administer
  // it and no way back from inside the product.
  const lockedToManager = user?.accountKey === accountKey && !user?.isOperator;

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
        >
          Edit
        </button>
        {!isActive && (
          <button
            type="button"
            disabled={reactivate.isPending}
            onClick={() => reactivate.mutate()}
            className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {reactivate.isPending ? "Reactivating…" : "Reactivate"}
          </button>
        )}
      </div>

      {serverError && !editOpen && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {serverError}
        </p>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <form
            onSubmit={handleSubmit((values) => {
              setServerError(null);
              save.mutate(values);
            })}
            noValidate
          >
            <DialogHeader>
              <DialogTitle>Edit account</DialogTitle>
              <DialogDescription>
                Changing the email changes the address this person signs in with.
              </DialogDescription>
            </DialogHeader>

            {serverError && (
              <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
                {serverError}
              </p>
            )}

            <div className="mt-4 grid gap-4">
              <div>
                <label htmlFor="edit-name" className="mb-1.5 block text-sm font-medium">
                  Name
                </label>
                <Input id="edit-name" type="text" autoComplete="off" {...register("name")} />
                {formState.errors.name && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="edit-email" className="mb-1.5 block text-sm font-medium">
                  Email
                </label>
                <Input id="edit-email" type="email" autoComplete="off" {...register("email")} />
                {formState.errors.email && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={lockedToManager} {...register("isManager")} />{" "}
                  Manager
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...register("isLearner")} /> Learner
                </label>
                {formState.errors.isLearner && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {formState.errors.isLearner.message}
                  </p>
                )}
              </div>

              {lockedToManager && (
                <p className="text-muted-foreground text-xs">
                  You cannot remove your own manager role. Ask another manager to change it.
                </p>
              )}
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={save.isPending}
                className="bg-primary rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
