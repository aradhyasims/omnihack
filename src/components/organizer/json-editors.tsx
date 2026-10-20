"use client";

import { useState } from "react";
import { FieldErrorText } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";

const input =
  "block w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15";

type CF = { key: string; label: string; type: "text" | "textarea" | "select" | "checkbox"; required: boolean; options?: string[] };

function toKey(label: string) {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""))
    .replace(/^[^a-z]+/, "");
  return (base || "field").slice(0, 40);
}

export function CustomFieldsEditor({ name, initial }: { name: string; initial: CF[] }) {
  const [rows, setRows] = useState<CF[]>(initial);
  const update = (i: number, patch: Partial<CF>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink-800">Custom registration questions</p>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-ink-100 p-3 sm:grid-cols-[1.5fr_1fr_auto_auto]">
            <input
              aria-label="Question"
              className={input}
              placeholder="Question"
              value={row.label}
              onChange={(e) => update(i, { label: e.target.value, key: toKey(e.target.value) })}
            />
            <select aria-label="Answer type" className={input} value={row.type} onChange={(e) => update(i, { type: e.target.value as CF["type"] })}>
              <option value="text">Short text</option>
              <option value="textarea">Long text</option>
              <option value="select">Choice</option>
              <option value="checkbox">Checkbox</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={row.required} onChange={(e) => update(i, { required: e.target.checked })} className="accent-brand-600" /> Required
            </label>
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
              Remove
            </button>
            {row.type === "select" ? (
              <input
                aria-label="Options"
                className={`${input} sm:col-span-4`}
                placeholder="Options, comma-separated"
                value={(row.options ?? []).join(", ")}
                onChange={(e) =>
                  update(i, {
                    options: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            ) : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        className={`${buttonClass("outline", "sm")} mt-3`}
        onClick={() => setRows((r) => [...r, { key: `question${r.length + 1}`, label: "", type: "text", required: false }])}
        disabled={rows.length >= 20}
      >
        + Add question
      </button>
      <FieldErrorText name={name} />
    </div>
  );
}

export function FaqEditor({ name, initial }: { name: string; initial: { q: string; a: string }[] }) {
  const [rows, setRows] = useState(initial);
  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(rows.filter((r) => r.q.trim() || r.a.trim()))} />
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-ink-100 p-3">
            <input
              aria-label="Question"
              className={input}
              placeholder="Question"
              value={row.q}
              onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))}
            />
            <textarea
              aria-label="Answer"
              className={input}
              rows={2}
              placeholder="Answer"
              value={row.a}
              onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
            />
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" className={`${buttonClass("outline", "sm")} mt-3`} onClick={() => setRows((r) => [...r, { q: "", a: "" }])}>
        + Add FAQ
      </button>
      <FieldErrorText name={name} />
    </div>
  );
}
