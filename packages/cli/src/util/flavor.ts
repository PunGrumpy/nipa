import { z } from "zod";

import type { Space } from "./api";

const MachineTypeSchema = z.object({
  cpu_policy: z.string().nullish(),
  id: z.string(),
  name: z.string(),
  ram: z.number(),
  // "dbaas" on the machine types that only databases use.
  resource: z.string().nullish(),
  // The portal's category, such as Shared-core or Memory Intensive.
  type: z.string().nullish(),
  vcpus: z.number(),
});

const MachineTypesSchema = z.object({
  machine_types: z.array(MachineTypeSchema),
});

export interface Flavor {
  id: string;
  name: string;
  vcpus: number;
  ramMb: number;
  /** The portal's category, such as Shared-core or Memory Intensive. */
  type: string | null;
  /** shared or dedicated vCPUs. */
  cpuPolicy: string | null;
}

const toFlavor = (machineType: z.infer<typeof MachineTypeSchema>): Flavor => ({
  cpuPolicy: machineType.cpu_policy ?? null,
  id: machineType.id,
  name: machineType.name,
  ramMb: machineType.ram,
  type: machineType.type ?? null,
  vcpus: machineType.vcpus,
});

const bySize = (a: Flavor, b: Flavor): number =>
  a.vcpus - b.vcpus || a.ramMb - b.ramMb || a.name.localeCompare(b.name);

/**
 * The flavors a server can have, smallest first. The Space API calls them
 * machine types, and leaves out the ones only `nipa db` clusters use.
 */
export const listFlavors = async (space: Space): Promise<Flavor[]> => {
  const body = await space.get("/v4/machine_types", MachineTypesSchema);
  return body.machine_types
    .filter((machineType) => machineType.resource !== "dbaas")
    .map(toFlavor)
    .toSorted(bySize);
};
