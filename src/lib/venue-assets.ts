import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const maxAssetBytes = 10 * 1024 * 1024;

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

type UploadLike = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function ensureUploadPresent(file: UploadLike | null | undefined) {
  return Boolean(file && typeof file.name === "string" && file.size > 0 && typeof file.arrayBuffer === "function");
}

export function hasUploadedFile(file: unknown): file is UploadLike {
  if (!file || typeof file !== "object") {
    return false;
  }

  const candidate = file as Partial<UploadLike>;
  return ensureUploadPresent(
    candidate.name && typeof candidate.size === "number" && typeof candidate.type === "string" && typeof candidate.arrayBuffer === "function"
      ? (candidate as UploadLike)
      : null,
  );
}

export async function saveVenueAssetUpload(input: {
  venueId: string;
  type: "BOTTLE_MENU" | "FOOD_MENU" | "HOOKAH_MENU" | "EVENT_FLYER";
  label: string;
  file: UploadLike;
  eventSeriesId?: string | null;
  eventOverrideId?: string | null;
}) {
  if (!allowedMimeTypes.has(input.file.type)) {
    throw new Error("Only PDF, JPG, PNG, WEBP, and GIF files are supported.");
  }

  if (input.file.size > maxAssetBytes) {
    throw new Error("Uploaded assets must be 10 MB or smaller.");
  }

  const extension = path.extname(input.file.name) || (input.file.type === "application/pdf" ? ".pdf" : "");
  const safeName = sanitizeFileSegment(path.basename(input.file.name, extension)) || "asset";
  const fileName = `${Date.now()}-${randomUUID()}-${safeName}${extension}`;
  const relativeDirectory = path.join("uploads", "venue-assets", input.venueId);
  const outputDirectory = path.join(process.cwd(), "public", relativeDirectory);
  const outputPath = path.join(outputDirectory, fileName);
  const publicUrl = `/${relativeDirectory.replace(/\\/g, "/")}/${fileName}`;

  await mkdir(outputDirectory, { recursive: true });
  const bytes = Buffer.from(await input.file.arrayBuffer());
  await writeFile(outputPath, bytes);

  const where = {
    venueId: input.venueId,
    type: input.type,
    active: true,
    ...(input.eventSeriesId ? { eventSeriesId: input.eventSeriesId } : { eventSeriesId: null }),
    ...(input.eventOverrideId ? { eventOverrideId: input.eventOverrideId } : { eventOverrideId: null }),
  };

  await prisma.venueAsset.updateMany({
    where,
    data: {
      active: false,
    },
  });

  return prisma.venueAsset.create({
    data: {
      venueId: input.venueId,
      type: input.type,
      label: input.label,
      fileName: input.file.name,
      storagePath: outputPath,
      publicUrl,
      mimeType: input.file.type,
      eventSeriesId: input.eventSeriesId ?? null,
      eventOverrideId: input.eventOverrideId ?? null,
    },
  });
}
