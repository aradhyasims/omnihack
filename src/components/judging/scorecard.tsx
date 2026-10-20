"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionForm, SubmitButton, TextArea, useFormState } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";

type Criterion = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  weight: number;
  minScore: number;
  maxScore: number;
  commentRequired: boolean;
};

function Live({ criteria, scores }: { criteria: Criterion[]; scores: Record<string, string> }) {
  const total = useMemo(() => {
    let t = 0;
    let complete = true;
    for (const c of criteria) {
      const v = scores[c.id];
      if (v === undefined || v === "") {
        complete = false;
        continue;
      }
      t += (c.weight * (Number(v) - c.minScore)) / (c.maxScore - c.minScore);
    }
    return { t: Math.round(t * 100) / 100, complete };
  }, [criteria, scores]);
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-display text-3xl font-extrabold tabular-nums">{total.t}</span>
      <span className="text-sm text-ink-500">/ 100 {total.complete ? "" : "(incomplete)"}</span>
    </div>
  );
}

function CriterionErrors({ id }: { id: string }) {
  const s = useFormState();
  const e = s.fieldErrors?.[id] ?? s.fieldErrors?.[`comment:${id}`];
  return e ? <p className="mt-1 text-xs font-medium text-rose-700">{e}</p> : null;
}

export function Scorecard({
  criteria,
  initialScores,
  initialComments,
  feedbackToTeam,
  privateComment,
  locked,
  saveAction,
  autosaveAction,
}: {
  criteria: Criterion[];
  initialScores: Record<string, number>;
  initialComments: Record<string, string>;
  feedbackToTeam: string;
  privateComment: string;
  locked: boolean;
  saveAction: (s: ActionState, fd: FormData) => Promise<ActionState>;
  autosaveAction: (fd: FormData) => Promise<ActionState>;
}) {
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(criteria.map((c) => [c.id, initialScores[c.id] !== undefined ? String(initialScores[c.id]) : ""])),
  );
  const [status, setStatus] = useState<string>("");
  const formRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const autosave = useCallback(async () => {
    const form = formRef.current?.closest("form");
    if (!form || locked || !dirty.current) return;
    dirty.current = false;
    setStatus("Saving…");
    const r = await autosaveAction(new FormData(form));
    setStatus(r.ok ? `Draft autosaved at ${new Date().toLocaleTimeString()}` : (r.error ?? "Autosave failed"));
  }, [autosaveAction, locked]);

  const schedule = useCallback(() => {
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(autosave, 1500);
  }, [autosave]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return (
    <ActionForm action={saveAction} className="space-y-6" onChange={locked ? undefined : schedule}>
      <div ref={formRef} />
      <fieldset disabled={locked} className="space-y-5">
        {criteria.map((c) => (
          <div key={c.id} className="rounded-xl border border-ink-100 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor={`score_${c.id}`} className="font-semibold text-ink-900">
                  {c.name} <span className="text-xs font-medium text-ink-400">· {c.weight}%</span>
                </label>
                {c.description ? <p className="text-sm text-ink-500">{c.description}</p> : null}
                {c.instructions ? <p className="mt-1 text-xs text-ink-500">{c.instructions}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <input
                  id={`score_${c.id}`}
                  name={`score_${c.id}`}
                  type="number"
                  inputMode="decimal"
                  min={c.minScore}
                  max={c.maxScore}
                  step={0.5}
                  value={scores[c.id]}
                  onChange={(e) => setScores((s) => ({ ...s, [c.id]: e.target.value }))}
                  className="h-10 w-20 rounded-lg border border-ink-200 px-2 text-center text-sm font-semibold tabular-nums focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
                />
                <span className="text-sm text-ink-400">/ {c.maxScore}</span>
              </div>
            </div>
            <input
              type="range"
              aria-label={`${c.name} score slider`}
              min={c.minScore}
              max={c.maxScore}
              step={0.5}
              value={scores[c.id] === "" ? c.minScore : scores[c.id]}
              onChange={(e) => setScores((s) => ({ ...s, [c.id]: e.target.value }))}
              className="mt-3 w-full accent-brand-600"
            />
            <textarea
              name={`comment_${c.id}`}
              defaultValue={initialComments[c.id] ?? ""}
              rows={2}
              placeholder={c.commentRequired ? "Comment (required)" : "Comment (optional)"}
              aria-label={`Comment for ${c.name}`}
              className="mt-3 block w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            />
            <CriterionErrors id={c.id} />
          </div>
        ))}
        <TextArea
          label="Feedback to the team"
          name="feedbackToTeam"
          defaultValue={feedbackToTeam}
          rows={3}
          hint="May be shared with the team if the organizer publishes feedback for this stage."
        />
        <TextArea label="Private note to organizers" name="privateComment" defaultValue={privateComment} rows={2} hint="Never shown to participants." />
      </fieldset>
      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 bg-white/95 px-5 py-4 backdrop-blur">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Weighted total</p>
          <Live criteria={criteria} scores={scores} />
          <p className="text-xs text-ink-400" aria-live="polite">
            {status}
          </p>
        </div>
        {!locked ? (
          <div className="flex gap-2">
            <SubmitButton variant="outline" name="intent" value="draft">
              Save draft
            </SubmitButton>
            <SubmitButton name="intent" value="finalize" pendingLabel="Finalizing…">
              Finalize & lock
            </SubmitButton>
          </div>
        ) : null}
      </div>
    </ActionForm>
  );
}
