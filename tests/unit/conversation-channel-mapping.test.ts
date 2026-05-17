import { describe, expect, it } from "vitest";
import { futureChannelAdapters, isChannelAdapterImplemented } from "@/lib/conversation/channel-adapters";
import {
  fromPrismaChannel,
  parseConversationChannel,
  toPrismaChannel,
} from "@/lib/conversation/channel-mapping";
import type { ConversationChannel } from "@/lib/conversation/conversation-types";

describe("conversation channel mapping", () => {
  it("maps shared conversation channels to persisted Prisma channels", () => {
    const expected: Array<[ConversationChannel, string]> = [
      ["website_chat", "WEBSITE_CHAT"],
      ["sms", "SMS"],
      ["instagram_dm", "INSTAGRAM_DM"],
      ["whatsapp", "WHATSAPP"],
      ["email", "EMAIL"],
      ["voice", "VOICE"],
      ["operator_dashboard", "OPERATOR_DASHBOARD"],
    ];

    for (const [conversationChannel, prismaChannel] of expected) {
      expect(toPrismaChannel(conversationChannel)).toBe(prismaChannel);
      expect(fromPrismaChannel(prismaChannel as ReturnType<typeof toPrismaChannel>)).toBe(conversationChannel);
    }
  });

  it("keeps legacy persisted channels mapped to current shared concepts", () => {
    expect(fromPrismaChannel("PHONE")).toBe("voice");
    expect(fromPrismaChannel("MANUAL")).toBe("operator_dashboard");
  });

  it("parses only known shared channels and exposes future adapters as placeholders", () => {
    expect(parseConversationChannel("whatsapp")).toBe("whatsapp");
    expect(parseConversationChannel("WHATSAPP")).toBe("whatsapp");
    expect(parseConversationChannel("fax")).toBeNull();
    expect(Object.keys(futureChannelAdapters).sort()).toEqual([
      "email",
      "instagram_dm",
      "operator_dashboard",
      "sms",
      "voice",
      "whatsapp",
    ]);
    expect(isChannelAdapterImplemented("website_chat")).toBe(true);
    expect(isChannelAdapterImplemented("whatsapp")).toBe(false);
  });
});
