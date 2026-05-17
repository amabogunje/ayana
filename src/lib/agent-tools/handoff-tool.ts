export type HandoffPlanInput = {
  isHumanTakeover: boolean;
  nextAction: string;
  handoffReason: string | null;
};

export function formatHumanHandoffNextAction(input: HandoffPlanInput) {
  if (!input.isHumanTakeover || !input.handoffReason) {
    return input.nextAction;
  }

  return `${input.nextAction} Reason: ${input.handoffReason}`;
}
