import type { ChatEvalScenario } from "@/lib/chat-evals/types";

export const websiteChatEvalScenarios: ChatEvalScenario[] = [
  {
    id: "early_close_after_date_and_party_size",
    title: "Anchors and closes early",
    description: "Guest gives a simple booking flow and the bot should quickly anchor on a real package and move toward deposit.",
    guestName: "Jordan",
    openingMessage: "hi",
    scriptedGuestMessages: ["tonight", "3"],
    guestPersonaPrompt:
      "You are a nightlife customer trying to book a table quickly. Keep your replies short and natural. Once the venue gives you a real option, you mostly want to know the next step to hold it.",
    successCriteria: [
      "After the date and party size are known, the bot should name a configured table option.",
      "The bot should mention the minimum spend and deposit once, then move toward phone or deposit link instead of restarting qualification.",
      "The bot should not repeat the exact same package pitch twice in a row.",
    ],
    maxTurns: 4,
  },
  {
    id: "hesitation_after_offer",
    title: "Handles hesitation naturally",
    description: "Guest wants to check with friends before committing and the bot should acknowledge that without restarting the sale.",
    guestName: "Dave",
    openingMessage: "tonight",
    scriptedGuestMessages: ["2 people", "can i ask my friends first"],
    guestPersonaPrompt:
      "You are interested, but you want to check with friends before you commit. Your hesitation is normal, not angry. See whether the venue bot handles the pause like a real host.",
    successCriteria: [
      "The bot should acknowledge that the guest can check with friends.",
      "The bot should keep the same package anchored without restarting the pitch from scratch.",
      "The bot should give the guest a clean path to come back and hold the table later.",
    ],
    maxTurns: 4,
  },
  {
    id: "event_question_mid_flow",
    title: "Answers event question directly",
    description: "Guest interrupts the booking flow to ask about events and the bot should answer the factual question before returning to sales.",
    guestName: "Deji",
    openingMessage: "tonight",
    scriptedGuestMessages: ["2", "are there any events tonight"],
    guestPersonaPrompt:
      "You are booking for tonight but you also want to know if there is anything special happening. Ask naturally and wait for a direct answer.",
    successCriteria: [
      "The bot should answer the event question directly instead of repeating the package pitch.",
      "If no event is configured, the bot should say that clearly instead of guessing.",
      "The bot can return to tables after answering, but it should answer the latest question first.",
    ],
    maxTurns: 4,
  },
  {
    id: "package_value_question",
    title: "Explains what the guest gets",
    description: "Guest asks what is included for the price, and the bot should explain the configured package naturally instead of repeating price only.",
    guestName: "Maya",
    openingMessage: "tonight",
    scriptedGuestMessages: ["4 people", "what do I get for that"],
    guestPersonaPrompt:
      "You are considering the offer, but before you move forward you want to know what the package actually includes. Ask naturally and expect a useful explanation.",
    successCriteria: [
      "The bot should explain the package in plain language instead of only repeating the price.",
      "The bot should stay within configured truth and not invent extras.",
      "The bot can still move toward the close after answering the question.",
    ],
    maxTurns: 4,
  },
  {
    id: "package_comparison_question",
    title: "Compares available options",
    description: "Guest wants to understand the difference between the starting option and the next step up.",
    guestName: "Chris",
    openingMessage: "tomorrow",
    scriptedGuestMessages: ["6 people", "what's the difference between the options"],
    guestPersonaPrompt:
      "You are shopping between options and want a clear, helpful comparison. Push for what changes as the package goes up.",
    successCriteria: [
      "The bot should compare the starting package with the next best option when one exists.",
      "The answer should sound like a host helping someone choose, not a repeated price pitch.",
      "The bot should stay grounded in configured package names and sizing.",
    ],
    maxTurns: 4,
  },
  {
    id: "direct_deposit_link_request",
    title: "Sends the deposit link cleanly",
    description: "Guest is ready to book and directly asks for the deposit link.",
    guestName: "Taylor",
    openingMessage: "tonight",
    scriptedGuestMessages: ["3 people", "send me the deposit link", "2674756962"],
    guestPersonaPrompt:
      "You are ready to move quickly. Once the venue offers you a table, ask directly for the deposit link and provide your phone number when needed.",
    successCriteria: [
      "The bot should recognize that the guest is ready to book.",
      "It should ask for the missing phone number if needed, then move directly into deposit-link behavior.",
      "It should avoid going back into qualification once the guest is clearly ready.",
    ],
    maxTurns: 5,
  },
  {
    id: "human_handoff_request",
    title: "Hands off to a human cleanly",
    description: "Guest explicitly asks for a human, and the bot should stop trying to sell and hand off.",
    guestName: "Alex",
    openingMessage: "tonight",
    scriptedGuestMessages: ["2 people", "I want a human"],
    guestPersonaPrompt:
      "You want to speak to a real person. Be direct about it and see whether the bot respects that instead of continuing the sales flow.",
    successCriteria: [
      "The bot should acknowledge the request for a human.",
      "It should stop pushing the normal automated close flow.",
      "It should clearly communicate that a human handoff is happening.",
    ],
    maxTurns: 4,
  },
  {
    id: "group_size_change",
    title: "Adapts when group size changes",
    description: "Guest changes the group size mid-flow and the bot should update the recommendation accordingly.",
    guestName: "Sam",
    openingMessage: "Friday",
    scriptedGuestMessages: ["3 people", "actually we're 7 now"],
    guestPersonaPrompt:
      "You are mid-booking and then your group size changes. See whether the venue bot updates the recommendation instead of sticking to the old table.",
    successCriteria: [
      "The bot should notice the new group size and stop anchoring on a too-small package.",
      "It should recommend the package that fits the new size, if one exists.",
      "It should not repeat the old package as if nothing changed.",
    ],
    maxTurns: 4,
  },
  {
    id: "vip_custom_request",
    title: "Escalates VIP custom request",
    description: "Guest asks for a custom VIP setup that should trigger human takeover instead of a made-up package.",
    guestName: "Nina",
    openingMessage: "Saturday",
    scriptedGuestMessages: ["10 people", "we want something custom and VIP"],
    guestPersonaPrompt:
      "You are asking for a bigger custom VIP arrangement. The right outcome is a real handoff, not a fabricated package.",
    successCriteria: [
      "The bot should avoid inventing a custom package.",
      "It should acknowledge that a human or operator needs to take over.",
      "It should stop the normal automated close flow.",
    ],
    maxTurns: 4,
  },
  {
    id: "mixed_fact_and_booking_question",
    title: "Answers logistics and keeps booking moving",
    description: "Guest asks a factual question mid-booking and the bot should answer it without losing the sales thread.",
    guestName: "Imani",
    openingMessage: "Friday",
    scriptedGuestMessages: ["4 people", "do you have valet and what table would you recommend"],
    guestPersonaPrompt:
      "You are booking but also care about logistics. Ask a mixed question and expect a direct answer plus a recommendation.",
    successCriteria: [
      "The bot should answer the valet question directly from venue knowledge.",
      "It should still recommend a package for the booking flow.",
      "It should not ignore either half of the guest's question.",
    ],
    maxTurns: 4,
  },
  {
    id: "ambiguous_party_size_reply",
    title: "Handles ambiguous party size naturally",
    description: "Guest is not fully sure on party size and the bot should clarify without sounding robotic.",
    guestName: "Rae",
    openingMessage: "tonight",
    scriptedGuestMessages: ["maybe 4 or 5", "let's say 5"],
    guestPersonaPrompt:
      "You are still figuring out the exact headcount. Respond naturally and see whether the bot clarifies in a human way.",
    successCriteria: [
      "The bot should recognize the uncertainty and ask for a usable number.",
      "It should not act as though the number was final when it was clearly tentative.",
      "Once clarified, it should move back into recommendation mode.",
    ],
    maxTurns: 5,
  },
  {
    id: "guest_contradiction_correction",
    title: "Updates after contradiction",
    description: "Guest corrects earlier information and the bot should adapt instead of sticking to stale context.",
    guestName: "Leo",
    openingMessage: "Friday",
    scriptedGuestMessages: ["3 people", "actually make that 2"],
    guestPersonaPrompt:
      "You correct yourself mid-conversation. The bot should notice the correction and update the recommendation cleanly.",
    successCriteria: [
      "The bot should treat the latest group size as the current truth.",
      "It should avoid continuing as if the old number were still active.",
      "It should re-anchor on the package that fits the corrected size.",
    ],
    maxTurns: 4,
  },
  {
    id: "post_close_follow_up",
    title: "Explains what happens after payment",
    description: "Guest is ready to book and asks what happens after they pay the deposit.",
    guestName: "Ava",
    openingMessage: "tonight",
    scriptedGuestMessages: ["2 people", "send me the deposit link", "2674756962", "what happens after I pay"],
    guestPersonaPrompt:
      "You are ready to book but want confidence about the next step after payment. Ask directly after the close starts.",
    successCriteria: [
      "The bot should explain what the deposit does and what happens next.",
      "It should not restart qualification after the guest is already in the payment flow.",
      "It should sound reassuring and operationally clear.",
    ],
    maxTurns: 6,
  },
];
