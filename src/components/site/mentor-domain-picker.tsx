"use client";

// Domain chips (up to 3). Picking "Other" reveals a text box; the server turns that into a reusable domain.
import { useEffect, useRef, useState } from "react";
import { FieldErrorText, TextInput } from "@/components/ui/form";
import { OTHER_DOMAIN, type DomainOption } from "@/content/mentor-domains";

const MAX = 3;

export function MentorDomainPicker({ options }: { options: DomainOption[] }) {
  const ref = useRef<HTMLFieldSetElement>(null);
  const [selected, setSelected] = useState<string[]>([]);

  // Clear the selection when <ActionForm resetOnSuccess> resets the form.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => setSelected([]);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const toggle = (value: string, checked: boolean) => setSelected((s) => (checked ? [...s, value] : s.filter((v) => v !== value)));
  const all = [...options, { value: OTHER_DOMAIN, label: "Other" }];
  const full = selected.length >= MAX;

  return (
    <fieldset ref={ref}>
      <legend className="mb-1.5 text-sm font-semibold text-ink-800">
        Domain
        <span className="ml-0.5 text-rose-600" aria-hidden>
          *
        </span>{" "}
        <span className="font-normal text-ink-500">
          (choose up to {MAX}
          {selected.length ? ` · ${selected.length} selected` : ""})
        </span>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {all.map((d) => {
          const checked = selected.includes(d.value);
          const disabled = full && !checked;
          return (
            <label
              key={d.value}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                checked
                  ? "border-brand-600 bg-brand-600 text-white"
                  : disabled
                    ? "cursor-not-allowed border-ink-100 text-ink-300"
                    : "cursor-pointer border-ink-200 text-ink-700 hover:border-brand-300"
              }`}
            >
              <input
                type="checkbox"
                name="domains"
                value={d.value}
                checked={checked}
                disabled={disabled}
                onChange={(e) => toggle(d.value, e.target.checked)}
                className="sr-only"
              />
              {d.label}
            </label>
          );
        })}
      </div>
      <FieldErrorText name="domains" />
      {selected.includes(OTHER_DOMAIN) ? (
        <TextInput
          label="Your domain"
          name="otherDomain"
          required
          maxLength={40}
          placeholder="e.g. Quantum Computing"
          hint="It will be added to the domain list for other mentors too."
          className="mt-3"
          autoFocus
        />
      ) : null}
    </fieldset>
  );
}
