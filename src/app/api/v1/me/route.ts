import { api, ok } from "@/server/api";
import { unauthenticated } from "@/server/errors";

export const GET = api(async ({ actor }) => {
  if (!actor) throw unauthenticated();
  return ok({ id: actor.id, name: actor.name, email: actor.email, platformRole: actor.platformRole, emailVerified: Boolean(actor.emailVerifiedAt) });
});
