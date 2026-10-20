import { api } from "@/server/api";
import { exportMyData } from "@/server/modules/participants/service";
import { unauthenticated } from "@/server/errors";

export const GET = api(
  async ({ actor }) => {
    if (!actor) throw unauthenticated();
    const data = await exportMyData(actor);
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="omnihack-data-export.json"`, "Cache-Control": "no-store" },
    });
  },
  { rate: [5, 60 * 60_000] },
);
