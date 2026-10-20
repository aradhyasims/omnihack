"use client";

// Optional profile photo picker with an instant local preview; the file is validated again on the server.
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { FieldErrorText, useFormState } from "@/components/ui/form";
import { Icon } from "@/components/ui/primitives";

const MAX_BYTES = 3 * 1024 * 1024;

export function MentorPhotoInput() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const serverError = useFormState().fieldErrors?.photo;

  // Clear the preview when <ActionForm resetOnSuccess> resets the form.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setPreview(null);
      setClientError(null);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setClientError(null);
    if (!file) return setPreview(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      e.target.value = "";
      setPreview(null);
      return setClientError("Only PNG, JPG or WebP images are allowed.");
    }
    if (file.size > MAX_BYTES) {
      e.target.value = "";
      setPreview(null);
      return setClientError("Photo must be 3 MB or smaller.");
    }
    setPreview(URL.createObjectURL(file));
  };

  const clear = () => {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setClientError(null);
  };

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink-800">
        Profile photo <span className="font-normal text-ink-500">(optional)</span>
      </p>
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-ink-100 text-ink-400 ring-1 ring-ink-200">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          {preview ? <img src={preview} alt="Selected profile photo" className="h-full w-full object-cover" /> : <Icon name="users" />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <label
              htmlFor={id}
              className="cursor-pointer rounded-md bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 focus-within:outline-2"
            >
              {preview ? "Change photo" : "Upload photo"}
            </label>
            {preview ? (
              <button type="button" onClick={clear} className="text-sm font-medium text-ink-500 hover:text-ink-800">
                Remove
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-ink-500">PNG, JPG or WebP · up to 3 MB · a square headshot works best</p>
        </div>
        <input
          ref={inputRef}
          id={id}
          type="file"
          name="photo"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          onChange={onChange}
          aria-invalid={Boolean(clientError || serverError)}
          className="sr-only"
        />
      </div>
      {clientError ? <p className="mt-1.5 text-xs font-medium text-rose-700">{clientError}</p> : <FieldErrorText name="photo" />}
    </div>
  );
}
