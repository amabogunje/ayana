import { VenuesWorkspace } from "@/components/venues-workspace";
import { requirePlatformUser } from "@/lib/auth";
import { listVenues } from "@/lib/admin-service";

export default async function VenuesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePlatformUser();
  const params = await searchParams;
  const venues = await listVenues();

  return (
    <main className="admin-page">
      <VenuesWorkspace venues={venues} error={params.error} />
    </main>
  );
}
