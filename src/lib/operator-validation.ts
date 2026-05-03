import { z } from "zod";

export const operatorLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

export const operatorInquiryStatusSchema = z.object({
  status: z.enum([
    "NEW",
    "QUALIFYING",
    "QUOTED",
    "DEPOSIT_SENT",
    "CONFIRMED",
    "NEEDS_HUMAN",
    "LOST",
  ]),
});

export const operatorVenueSettingsSchema = z.object({
  addressLine1: z.string().max(200).optional().default(""),
  city: z.string().min(1),
  state: z.string().max(100).optional().default(""),
  postalCode: z.string().max(40).optional().default(""),
  phoneNumber: z.string().max(40).optional().default(""),
  timezone: z.string().min(1),
  hoursSummary: z.string().optional().default(""),
  primaryOperatorName: z.string().optional().default(""),
  primaryOperatorRole: z.string().optional().default(""),
  primaryOperatorEmail: z.string().optional().default(""),
  depositPolicy: z.string().min(1),
  servesFood: z.boolean().optional().default(false),
  servesHookah: z.boolean().optional().default(false),
  hasParking: z.boolean().optional().default(false),
  hasValet: z.boolean().optional().default(false),
  dressCodeSummary: z.string().optional().default(""),
  agePolicySummary: z.string().optional().default(""),
  websiteChatEnabled: z.boolean().optional(),
  websiteChatAllowedOrigins: z.string().optional(),
  websiteChatWelcomeMessage: z.string().optional(),
  websiteChatPromptPlaceholder: z.string().optional(),
});
