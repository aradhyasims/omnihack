"use server";

import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/action";
import { clientMeta } from "@/server/auth/current";
import { formToObject } from "@/server/validation";
import { submitInquiry } from "@/server/modules/admin/service";

export async function contactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ip } = await clientMeta();
    await submitInquiry(formToObject(fd), ip);
    return "Thanks — your message was received. We'll reply by email.";
  });
}
