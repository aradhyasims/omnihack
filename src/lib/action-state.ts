// Result shape returned by every server action and consumed by <ActionForm>.
export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: Record<string, unknown>;
  /** Changes on each submission so the form can react (e.g. reset) to repeated results. */
  ts?: number;
};

export const initialActionState: ActionState = {};
