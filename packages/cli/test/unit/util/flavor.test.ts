import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { listFlavors } from "../../../src/util/flavor";
import { alphaSpace } from "../../helpers";
import { startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

describe("listFlavors", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  test("leaves out the database machine types and sorts by size", async () => {
    const flavors = await listFlavors(await alphaSpace(keystone.url));
    expect(flavors.map((flavor) => flavor.name)).toEqual([
      "nsa.small.v2",
      "csa.large.v2",
      "csa.xlarge.v2",
    ]);
  });
});
