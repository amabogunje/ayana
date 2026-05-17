import type {
  ChatEvalScenario,
  ChatEvalScenarioCheckResult,
  ChatEvalScenarioResult,
} from "@/lib/chat-evals/types";

type EvalTranscriptMessage = {
  authorRole: string;
  content: string;
};

type ScoreInput = {
  scenario: ChatEvalScenario;
  transcript: EvalTranscriptMessage[];
  venueName: string;
  configuredTableNames: string[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function getAiMessages(transcript: EvalTranscriptMessage[]) {
  return transcript.filter((message) => message.authorRole === "ai" || message.authorRole === "operator");
}

function getLastAiMessage(transcript: EvalTranscriptMessage[]) {
  return [...transcript].reverse().find((message) => message.authorRole === "ai" || message.authorRole === "operator");
}

function containsAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function noExactConsecutiveRepeat(transcript: EvalTranscriptMessage[]) {
  const aiMessages = getAiMessages(transcript).map((message) => normalize(message.content));
  for (let index = 1; index < aiMessages.length; index += 1) {
    if (aiMessages[index] && aiMessages[index] === aiMessages[index - 1]) {
      return false;
    }
  }
  return true;
}

function aiMentionsConfiguredTable(transcript: EvalTranscriptMessage[], configuredTableNames: string[]) {
  const aiText = getAiMessages(transcript)
    .map((message) => message.content.toLowerCase())
    .join("\n");
  return configuredTableNames.some((name) => aiText.includes(name.toLowerCase()));
}

function aiAvoidsInventedDiscounts(transcript: EvalTranscriptMessage[]) {
  const aiText = getAiMessages(transcript)
    .map((message) => normalize(message.content))
    .join("\n");
  return !/\bfree (?:upgrade|bottle|table|entry|cover)\b|\bfor free\b|\bdiscount\b|\bcomp\b|\bcomped\b|\bwaive\b|\breduced\b|\bcheaper than\b/.test(aiText);
}

function aiMovesTowardClose(transcript: EvalTranscriptMessage[]) {
  const aiText = getAiMessages(transcript)
    .map((message) => message.content.toLowerCase())
    .join("\n");
  return containsAny(aiText, [/\bphone number\b/, /\bdeposit link\b/, /\block it in\b/, /\bhold it\b/]);
}

function aiAcknowledgesHesitation(transcript: EvalTranscriptMessage[]) {
  const lastAiMessage = normalize(getLastAiMessage(transcript)?.content ?? "");
  const acknowledges = containsAny(lastAiMessage, [
    /\bof course\b/,
    /\bno problem\b/,
    /\bno rush\b/,
    /\bwhen you re ready\b/,
    /\bmessage me back\b/,
    /\bcome back to me\b/,
    /\bcheck with your friends\b/,
    /\bcheck with your group\b/,
  ]);
  const overlyPushy = /\bsend the best phone number\b|\bsend the deposit link\b/.test(lastAiMessage);
  return acknowledges && !overlyPushy;
}

function aiAnswersEventQuestion(transcript: EvalTranscriptMessage[]) {
  const lastAiMessage = getLastAiMessage(transcript)?.content.toLowerCase() ?? "";
  return containsAny(lastAiMessage, [/\bevent\b/, /\bspecial event\b/, /\bhappening\b/, /\bconfigured\b/]);
}

function aiExplainsPackageValue(transcript: EvalTranscriptMessage[]) {
  const lastAiMessage = normalize(getLastAiMessage(transcript)?.content ?? "");
  return containsAny(lastAiMessage, [
    /\btable\b/,
    /\bbooth\b/,
    /\bspace\b/,
    /\bsection\b/,
    /\bmain room\b/,
    /\bvisibility\b/,
    /\bpackage\b/,
    /\bfit\b/,
  ]);
}

function aiComparesOptions(transcript: EvalTranscriptMessage[], configuredTableNames: string[]) {
  const lastAiMessage = normalize(getLastAiMessage(transcript)?.content ?? "");
  const matchedNames = configuredTableNames.filter((name) => lastAiMessage.includes(normalize(name)));
  return matchedNames.length >= 1 && containsAny(lastAiMessage, [/\bnext\b/, /\bmore space\b/, /\bbigger\b/, /\bstarting option\b/, /\bstep up\b/]);
}

function aiHandlesDirectClose(transcript: EvalTranscriptMessage[]) {
  const aiText = getAiMessages(transcript)
    .map((message) => normalize(message.content))
    .join("\n");
  return containsAny(aiText, [/\bdeposit link\b/, /\bphone number\b/, /\block in\b/, /\bhold it\b/]);
}

function aiHandlesHumanHandoff(transcript: EvalTranscriptMessage[]) {
  const lastAiMessage = normalize(getLastAiMessage(transcript)?.content ?? "");
  return containsAny(lastAiMessage, [/\bhuman\b/, /\bteam\b/, /\boperator\b/, /\bflagging\b/, /\bhand off\b/, /\bhandoff\b/]);
}

function aiAdjustsForGroupSizeChange(transcript: EvalTranscriptMessage[], configuredTableNames: string[]) {
  const aiMessages = getAiMessages(transcript).map((message) => normalize(message.content));
  const lastAiMessage = aiMessages[aiMessages.length - 1] ?? "";
  const earlierAiText = aiMessages.slice(0, -1).join("\n");
  const mentionsConfigured = configuredTableNames.some((name) => lastAiMessage.includes(normalize(name)));
  const changedDirection = lastAiMessage !== earlierAiText;
  return mentionsConfigured && changedDirection;
}

function aiEscalatesToHuman(transcript: EvalTranscriptMessage[]) {
  const aiText = getAiMessages(transcript)
    .map((message) => normalize(message.content))
    .join("\n");
  return containsAny(aiText, [/\bhuman\b/, /\boperator\b/, /\bteam\b/, /\bflagging\b/, /\bescalat/]);
}

function aiAnswersMixedQuestion(transcript: EvalTranscriptMessage[], configuredTableNames: string[]) {
  const lastAiMessage = normalize(getLastAiMessage(transcript)?.content ?? "");
  const mentionsValet = /\bvalet\b|\bparking\b/.test(lastAiMessage);
  const mentionsPackage = configuredTableNames.some((name) => lastAiMessage.includes(normalize(name)));
  return mentionsValet && mentionsPackage;
}

function aiClarifiesAmbiguity(transcript: EvalTranscriptMessage[]) {
  const aiMessages = getAiMessages(transcript).map((message) => normalize(message.content));
  return aiMessages.some((message) => /\bwhich number should i work with\b|\bwhat headcount should i lock in\b|\bwhat should i lock in\b|\bconfirm the group size\b|\bwhich should i use\b/.test(message));
}

function aiUsesCorrectedContext(transcript: EvalTranscriptMessage[]) {
  const lastAiMessage = normalize(getLastAiMessage(transcript)?.content ?? "");
  return /\b2 guests\b|\bfor 2\b|\bworks for 2\b/.test(lastAiMessage);
}

function aiExplainsPostPayment(transcript: EvalTranscriptMessage[]) {
  const lastAiMessage = normalize(getLastAiMessage(transcript)?.content ?? "");
  return containsAny(lastAiMessage, [
    /\bdeposit\b/,
    /\bhold(s)? the table\b/,
    /\bconfirmed\b/,
    /\bafter payment\b/,
    /\bafter you pay\b/,
    /\bnext step\b/,
  ]);
}

function describeCheck(passed: boolean, success: string, failure: string): string {
  return passed ? success : failure;
}

export function scoreWebsiteChatTranscript(input: ScoreInput): ChatEvalScenarioResult {
  const checks: ChatEvalScenarioCheckResult[] = [];

  const noRepeat = noExactConsecutiveRepeat(input.transcript);
  checks.push({
    name: "no_exact_repeat",
    passed: noRepeat,
    detail: describeCheck(noRepeat, "The bot avoided exact consecutive repeat turns.", "The bot repeated the same turn verbatim."),
    weight: 1,
  });

  const mentionsConfiguredTable =
    input.scenario.id === "vip_custom_request" && aiEscalatesToHuman(input.transcript)
      ? true
      : aiMentionsConfiguredTable(input.transcript, input.configuredTableNames);
  checks.push({
    name: "mentions_configured_table",
    passed: mentionsConfiguredTable,
    detail: describeCheck(
      mentionsConfiguredTable,
      "The bot anchored on a configured table option.",
      "The bot never clearly anchored on a configured table option.",
    ),
    weight: 2,
  });

  const avoidsInventedDiscounts = aiAvoidsInventedDiscounts(input.transcript);
  checks.push({
    name: "no_invented_discount",
    passed: avoidsInventedDiscounts,
    detail: describeCheck(
      avoidsInventedDiscounts,
      "The bot avoided invented discounts, comps, and waived fees.",
      "The bot implied an unconfigured discount, comp, or waived fee.",
    ),
    weight: 2,
  });

  if (input.scenario.id === "early_close_after_date_and_party_size") {
    const movesTowardClose = aiMovesTowardClose(input.transcript);
    checks.push({
      name: "moves_toward_close",
      passed: movesTowardClose,
      detail: describeCheck(
        movesTowardClose,
        "The bot moved toward phone capture or deposit close.",
        "The bot did not clearly move toward phone capture or deposit close.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "hesitation_after_offer") {
    const acknowledgesHesitation = aiAcknowledgesHesitation(input.transcript);
    checks.push({
      name: "acknowledges_hesitation",
      passed: acknowledgesHesitation,
      detail: describeCheck(
        acknowledgesHesitation,
        "The bot acknowledged the guest's hesitation naturally.",
        "The bot did not acknowledge the guest's hesitation naturally.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "event_question_mid_flow") {
    const answersEventQuestion = aiAnswersEventQuestion(input.transcript);
    checks.push({
      name: "answers_event_question",
      passed: answersEventQuestion,
      detail: describeCheck(
        answersEventQuestion,
        "The bot answered the event question directly.",
        "The bot did not answer the event question directly.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "package_value_question") {
    const explainsValue = aiExplainsPackageValue(input.transcript);
    checks.push({
      name: "explains_package_value",
      passed: explainsValue,
      detail: describeCheck(
        explainsValue,
        "The bot explained what the package means in plain language.",
        "The bot did not clearly explain what the guest gets for the package.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "package_comparison_question") {
    const comparesOptions = aiComparesOptions(input.transcript, input.configuredTableNames);
    checks.push({
      name: "compares_options",
      passed: comparesOptions,
      detail: describeCheck(
        comparesOptions,
        "The bot compared available options in a helpful way.",
        "The bot did not clearly compare the available options.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "direct_deposit_link_request") {
    const handlesDirectClose = aiHandlesDirectClose(input.transcript);
    checks.push({
      name: "handles_direct_close",
      passed: handlesDirectClose,
      detail: describeCheck(
        handlesDirectClose,
        "The bot treated the guest like they were ready to book.",
        "The bot did not move cleanly into the direct close flow.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "human_handoff_request") {
    const handlesHuman = aiHandlesHumanHandoff(input.transcript);
    checks.push({
      name: "handles_human_handoff",
      passed: handlesHuman,
      detail: describeCheck(
        handlesHuman,
        "The bot acknowledged the human handoff request clearly.",
        "The bot did not clearly hand off to a human.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "group_size_change") {
    const adjusts = aiAdjustsForGroupSizeChange(input.transcript, input.configuredTableNames);
    checks.push({
      name: "adjusts_for_group_size_change",
      passed: adjusts,
      detail: describeCheck(
        adjusts,
        "The bot adapted to the new group size.",
        "The bot did not clearly adjust after the group size changed.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "vip_custom_request") {
    const escalates = aiEscalatesToHuman(input.transcript);
    checks.push({
      name: "escalates_vip_custom_request",
      passed: escalates,
      detail: describeCheck(
        escalates,
        "The bot escalated the VIP/custom request instead of inventing an offer.",
        "The bot did not clearly escalate the VIP/custom request.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "mixed_fact_and_booking_question") {
    const answersMixed = aiAnswersMixedQuestion(input.transcript, input.configuredTableNames);
    checks.push({
      name: "answers_mixed_fact_and_booking_question",
      passed: answersMixed,
      detail: describeCheck(
        answersMixed,
        "The bot answered the logistics question and kept the booking moving.",
        "The bot did not clearly answer both parts of the mixed question.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "ambiguous_party_size_reply") {
    const clarifies = aiClarifiesAmbiguity(input.transcript);
    checks.push({
      name: "clarifies_ambiguous_party_size",
      passed: clarifies,
      detail: describeCheck(
        clarifies,
        "The bot clarified the uncertain party size naturally.",
        "The bot did not clearly clarify the uncertain party size.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "guest_contradiction_correction") {
    const usesCorrection = aiUsesCorrectedContext(input.transcript);
    checks.push({
      name: "uses_corrected_context",
      passed: usesCorrection,
      detail: describeCheck(
        usesCorrection,
        "The bot updated the recommendation after the guest corrected the group size.",
        "The bot did not clearly update after the guest corrected the group size.",
      ),
      weight: 2,
    });
  }

  if (input.scenario.id === "post_close_follow_up") {
    const explainsPostPayment = aiExplainsPostPayment(input.transcript);
    checks.push({
      name: "explains_post_payment_flow",
      passed: explainsPostPayment,
      detail: describeCheck(
        explainsPostPayment,
        "The bot explained what happens after the deposit is paid.",
        "The bot did not clearly explain what happens after payment.",
      ),
      weight: 2,
    });
  }

  const totalWeight = checks.reduce((sum, check) => sum + (check.weight ?? 1), 0);
  const earnedWeight = checks.reduce((sum, check) => sum + (check.passed ? (check.weight ?? 1) : 0), 0);
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  const passed = checks.every((check) => check.passed);

  return {
    scenarioId: input.scenario.id,
    title: input.scenario.title,
    mode: "scripted",
    passed,
    score,
    checks,
    transcript: input.transcript,
    summary: passed
      ? `${input.venueName}: ${input.scenario.title} passed at ${score}/100.`
      : `${input.venueName}: ${input.scenario.title} needs work at ${score}/100.`,
    llmJudge: null,
  };
}
