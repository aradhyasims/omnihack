"use server";

import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/action";
import { clientMeta } from "@/server/auth/current";
import { formToObject } from "@/server/validation";
import { submitMentorApplication } from "@/server/modules/admin/service";

export async function mentorRegisterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ip } = await clientMeta();
    const photo = fd.get("photo");
    await submitMentorApplication(formToObject(fd), photo instanceof File ? photo : null, ip);
    return "Thank you for volunteering! Our team will review your profile and reach out by email.";
  });
}
