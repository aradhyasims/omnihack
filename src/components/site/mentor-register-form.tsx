import Link from "next/link";
import { ActionForm, SubmitButton, TextInput } from "@/components/ui/form";
import type { DomainOption } from "@/content/mentor-domains";
import { Icon } from "@/components/ui/primitives";
import { mentorRegisterAction } from "@/app/(site)/actions";
import { MentorPhotoInput } from "./mentor-photo-input";
import { MentorDomainPicker } from "./mentor-domain-picker";

/** Homepage hero card where external industry mentors register their interest. */
export function MentorRegisterForm({ domains }: { domains: DomainOption[] }) {
  return (
    <div id="become-a-mentor" className="relative scroll-mt-24">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand-500/30 via-accent-400/10 to-transparent blur-2xl" aria-hidden />
      <div className="relative rounded-3xl bg-white p-6 text-ink-900 shadow-2xl sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-900/30">
            <Icon name="mentor" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold">Become a mentor</h2>
            <p className="mt-0.5 text-sm leading-6 text-ink-500">Industry professionals: guide teams and help ideas become winning projects.</p>
          </div>
        </div>
        <ActionForm action={mentorRegisterAction} resetOnSuccess refresh={false} className="mt-5 space-y-4">
          <MentorPhotoInput />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Full name" name="name" required autoComplete="name" className="sm:col-span-2" />
            <TextInput label="Email" name="email" type="email" required autoComplete="email" />
            <TextInput label="Mobile number" name="mobile" type="tel" inputMode="tel" required autoComplete="tel" placeholder="+91 98765 43210" />
            <TextInput label="Designation" name="designation" required autoComplete="organization-title" placeholder="e.g. Senior Engineer, Acme" />
            <TextInput label="Qualification" name="qualification" required placeholder="e.g. M.Tech, Computer Science" />
            <TextInput label="City" name="city" required autoComplete="address-level2" />
            <TextInput label="Country" name="country" required autoComplete="country-name" />
          </div>
          <MentorDomainPicker options={domains} />
          <TextInput label="LinkedIn profile URL" name="linkedinUrl" type="url" inputMode="url" required placeholder="https://www.linkedin.com/in/your-name" />
          {/* Honeypot field for bots — hidden from people and assistive tech */}
          <div className="hidden" aria-hidden>
            <label>
              Website <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <SubmitButton size="lg" pendingLabel="Registering…" className="w-full">
            Register as a mentor <Icon name="arrow" className="h-4 w-4" />
          </SubmitButton>
          <p className="text-center text-xs text-ink-500">
            Your photo, name, designation, domains and LinkedIn will be listed on our{" "}
            <Link href="/mentorship" className="font-semibold text-brand-600 hover:underline">
              Mentorship page
            </Link>
            . Your qualification and city are also shown to organizers of verified competitions so they can invite you as a mentor or judge. Your email and
            mobile number stay private.
          </p>
        </ActionForm>
      </div>
    </div>
  );
}
