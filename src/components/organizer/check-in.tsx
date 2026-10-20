"use client";

// Check-in desk: works with handheld QR scanners (they type the code + Enter) and, where the browser
// supports the BarcodeDetector API, with the device camera. No video is stored or uploaded.
import { useEffect, useRef, useState } from "react";
import { ActionForm, SubmitButton, TextInput } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

export function CheckInPanel({
  action,
  sessions,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  sessions: { id: string; title: string }[];
}) {
  const formRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [supported, setSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  useEffect(() => setSupported(typeof window !== "undefined" && "BarcodeDetector" in window), []);
  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const detector: Detector = new (window as unknown as { BarcodeDetector: new (o: object) => Detector }).BarcodeDetector({ formats: ["qr_code"] });
        while (!stop) {
          const codes = await detector.detect(video).catch(() => []);
          if (codes[0]?.rawValue) {
            const form = formRef.current?.closest("form");
            const input = form?.querySelector<HTMLInputElement>('input[name="code"]');
            if (form && input) {
              input.value = codes[0].rawValue;
              form.requestSubmit();
            }
            await new Promise((r) => setTimeout(r, 2500));
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch {
        setScanning(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning]);
  return (
    <ActionForm action={action} resetOnSuccess className="space-y-3">
      <div ref={formRef} />
      <TextInput
        label="Check-in code"
        name="code"
        placeholder="CK-XXXX-XXXX-XXXX"
        autoFocus
        autoComplete="off"
        required
        hint="Scan the participant's QR code or type the code."
      />
      {sessions.length ? (
        <label className="block text-sm">
          <span className="mb-1.5 block font-semibold text-ink-800">Scope</span>
          <select name="sessionId" className="block w-full rounded-lg border border-ink-200 px-3 py-2 text-sm">
            <option value="">Event check-in</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                Session: {s.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Checking…">Check in</SubmitButton>
        {supported ? (
          <button type="button" className={buttonClass("outline")} onClick={() => setScanning((s) => !s)}>
            {scanning ? "Stop camera" : "Scan with camera"}
          </button>
        ) : null}
      </div>
      {scanning ? <video ref={videoRef} className="mt-2 w-full max-w-sm rounded-xl bg-ink-950" muted playsInline /> : null}
    </ActionForm>
  );
}
