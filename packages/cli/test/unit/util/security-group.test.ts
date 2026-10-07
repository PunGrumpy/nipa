import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { listSecurityGroups } from "../../../src/util/security-group";
import { alphaSpace } from "../../helpers";
import { startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

describe("listSecurityGroups", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  test("reads each group and its rules, newest first", async () => {
    const groups = await listSecurityGroups(await alphaSpace(keystone.url));
    expect(groups.map((group) => group.name)).toEqual(["web", "default"]);
    expect(groups[1]?.rules).toHaveLength(3);
    expect(groups[1]?.rules[0]).toMatchObject({
      portMin: null,
      protocol: "any",
      remoteGroupId: "ssss1111-0000-4000-8000-000000000001",
    });
    expect(groups[1]?.createdAt).toEndWith("Z");
  });
});
