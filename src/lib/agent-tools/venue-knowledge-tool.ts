import { buildVenueKnowledgeContext } from "@/lib/venue-knowledge-service";

export async function searchVenueKnowledgeForAgent(input: {
  venueId: string;
  requestedDateLabel?: string | null;
}) {
  return buildVenueKnowledgeContext(input.venueId, input.requestedDateLabel ?? null);
}
