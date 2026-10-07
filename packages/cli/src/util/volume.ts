import { z } from "zod";

import type { Space } from "./api";

const AttachmentSchema = z.object({
  device: z.string(),
  serverId: z.string(),
});

const VolumeSchema = z.object({
  attachments: z.array(AttachmentSchema),
  availability_zone: z.string(),
  // Cinder sends "true" or "false".
  bootable: z.string(),
  created_at: z.string(),
  id: z.string(),
  name: z.string(),
  size: z.number(),
  status: z.string(),
  volume_type: z.string().nullable(),
});

const VolumesSchema = z.object({ volumes: z.array(VolumeSchema) });

export interface Attachment {
  serverId: string;
  /** Where the server sees the volume, such as /dev/vda. */
  device: string;
}

export interface Volume {
  id: string;
  name: string;
  /** Cinder's status, such as available, in-use or creating. */
  status: string;
  sizeGb: number;
  /** The volume type, such as Standard_SSD. */
  type: string | null;
  bootable: boolean;
  attachments: Attachment[];
  zone: string;
  createdAt: string;
}

const toVolume = (volume: z.infer<typeof VolumeSchema>): Volume => ({
  attachments: volume.attachments,
  bootable: volume.bootable === "true",
  createdAt: volume.created_at,
  id: volume.id,
  name: volume.name,
  sizeGb: volume.size,
  status: volume.status,
  type: volume.volume_type,
  zone: volume.availability_zone,
});

/** Every volume in the project, newest first. */
export const listVolumes = async (space: Space): Promise<Volume[]> => {
  const body = await space.get("/v4/volumes", VolumesSchema);
  return body.volumes
    .map(toVolume)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};
