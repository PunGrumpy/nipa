import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { listVolumes } from "../../../src/util/volume";
import { alphaSpace } from "../../helpers";
import { startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

describe("listVolumes", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  test("reads each volume, newest first", async () => {
    const volumes = await listVolumes(await alphaSpace(keystone.url));
    expect(volumes.map((volume) => volume.name)).toEqual([
      "",
      "web-1-vol-0",
      "backups",
    ]);
    expect(volumes[0]).toMatchObject({ status: "creating", type: null });
    expect(volumes[2]).toMatchObject({
      attachments: [],
      bootable: false,
      sizeGb: 100,
    });
  });
});
