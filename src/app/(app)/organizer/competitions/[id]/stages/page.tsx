import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/primitives";
import { StageManager } from "@/components/organizer/stage-manager";
import { loadManaged } from "../load";

export default async function StagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { competition: c, can } = await loadManaged(id);
  if (!can("stage.manage")) redirect(`/organizer/competitions/${id}`);
  return (
    <div className="space-y-5">
      <Alert tone="info" title="Configurable competition engine">
        Stages run in order. Open a stage to accept submissions, close it, start judging, record advancement decisions on the Judging tab, then complete it.
        Stages that only admit advanced projects can start once the previous judged stage is completed. Every transition is recorded.
      </Alert>
      {c.status !== "PUBLISHED" ? <Alert tone="warning">Stage transitions are available once the competition is published.</Alert> : null}
      <StageManager competitionId={id} tz={c.timezone} />
    </div>
  );
}
