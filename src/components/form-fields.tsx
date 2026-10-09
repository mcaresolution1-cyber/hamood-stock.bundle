"use client";

/**
 * Form fields for react-hook-form + Zod. Zod messages are translation keys; these components
 * translate them. Use inside <Form {...form}>.
 */
import { useFormContext, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { NativeSelect } from "@/components/native-select";
import { useMessage } from "@/components/use-message";
import type { ActionResult } from "@/server/actions/result";

type BaseProps = { name: string; label: string; hint?: string; optional?: boolean };

function Label({ label, optional }: { label: string; optional?: boolean }) {
  const t = useTranslations("common");
  return (
    <FormLabel>
      {label}
      {optional && <span className="font-normal text-muted-foreground"> ({t("optional")})</span>}
    </FormLabel>
  );
}

export function TextField({
  name,
  label,
  hint,
  optional,
  ...input
}: BaseProps & Omit<React.ComponentProps<typeof Input>, "name">) {
  const { control } = useFormContext();
  const message = useMessage();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <Label label={label} optional={optional} />
          <FormControl>
            <Input className="h-10" {...input} {...field} value={field.value ?? ""} />
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage>{message(fieldState.error?.message)}</FormMessage>
        </FormItem>
      )}
    />
  );
}

export function SelectField({
  name,
  label,
  hint,
  optional,
  options,
  placeholder,
}: BaseProps & { options: { value: string; label: string }[]; placeholder?: string }) {
  const { control } = useFormContext();
  const message = useMessage();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <Label label={label} optional={optional} />
          <FormControl>
            <NativeSelect {...field} value={field.value ?? ""} aria-invalid={Boolean(fieldState.error)}>
              {placeholder !== undefined && <option value="">{placeholder}</option>}
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage>{message(fieldState.error?.message)}</FormMessage>
        </FormItem>
      )}
    />
  );
}

/**
 * Put a failed action's field errors on the form. Returns the form-level message to show
 * (or null when every problem was attached to a field).
 */
export function applyActionErrors<T extends FieldValues, C, R extends FieldValues>(
  form: UseFormReturn<T, C, R>,
  result: Extract<ActionResult<unknown>, { ok: false }>,
): string | null {
  const fields = Object.entries(result.fieldErrors ?? {});
  for (const [path, key] of fields) form.setError(path as Path<T>, { type: "server", message: key });
  return fields.length ? null : result.error;
}
