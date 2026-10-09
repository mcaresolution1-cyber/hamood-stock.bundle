"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SelectField, TextField, applyActionErrors } from "@/components/form-fields";
import { useMessage } from "@/components/use-message";
import { userFormSchema, type UserFormValues } from "@/lib/validation/users";
import { createUser, updateUser } from "@/server/actions/users";

type Existing = { id: string; name: string; email: string; role: "ADMIN" | "STAFF" | "VIEWER"; warehouseIds: string[] };
type WarehouseOption = { id: string; name: string };

export function UserDialog({ user, warehouses }: { user?: Existing; warehouses: WarehouseOption[] }) {
  const t = useTranslations();
  const message = useMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Editing doesn't touch the password (there's a separate reset dialog).
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema(!user)),
    defaultValues: user
      ? { name: user.name, email: user.email, role: user.role, warehouseIds: user.warehouseIds, password: "" }
      : { name: "", email: "", role: "STAFF", warehouseIds: [], password: "" },
  });
  const role = useWatch({ control: form.control, name: "role" });

  function onSubmit(values: UserFormValues) {
    startTransition(async () => {
      const result = user ? await updateUser(user.id, values) : await createUser(values); // server re-validates
      if (result.ok) {
        toast.success(t("common.saved"));
        setOpen(false);
        if (!user) form.reset();
        router.refresh();
      } else {
        const formError = applyActionErrors(form, result);
        if (formError) toast.error(message(formError, result.params));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {user ? (
          <Button variant="ghost" size="sm">
            {t("common.edit")}
          </Button>
        ) : (
          <Button>
            <PlusIcon className="size-4" aria-hidden />
            {t("users.new")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user ? t("users.editTitle") : t("users.new")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <TextField name="name" label={t("users.name")} autoFocus={!user} />
            <TextField name="email" type="email" dir="ltr" autoComplete="off" label={t("users.email")} />
            {!user && (
              <TextField name="password" type="password" dir="ltr" autoComplete="new-password" label={t("users.password")} />
            )}
            <SelectField
              name="role"
              label={t("users.role")}
              hint={t(`users.roleHelp.${role}`)}
              options={(["STAFF", "VIEWER", "ADMIN"] as const).map((r) => ({ value: r, label: t(`roles.${r}`) }))}
            />
            {role === "STAFF" && (
              <FormField
                control={form.control}
                name="warehouseIds"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t("users.warehouses")}</FormLabel>
                    <FormDescription>{t("users.warehousesHint")}</FormDescription>
                    <FormControl>
                      <div className="grid gap-1 rounded-md border p-2">
                        {warehouses.map((w) => {
                          const checked = field.value?.includes(w.id) ?? false;
                          return (
                            <label key={w.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 hover:bg-accent">
                              <input
                                type="checkbox"
                                className="size-4 accent-primary"
                                checked={checked}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.checked
                                      ? [...(field.value ?? []), w.id]
                                      : (field.value ?? []).filter((id) => id !== w.id),
                                  )
                                }
                              />
                              <span className="text-sm">{w.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </FormControl>
                    <FormMessage>{message(fieldState.error?.message)}</FormMessage>
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
