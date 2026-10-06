import { describe, expect, test } from "bun:test";

import { valueKind } from "../../../src/util/openstack";

const kind = (line: string) => valueKind(line.split(" "));

describe("valueKind", () => {
  test("every argument of a server command is a server", () => {
    expect(kind("server show w")).toBe("servers");
    expect(kind("server stop web-1 w")).toBe("servers");
    expect(kind("console log show ")).toBe("servers");
  });

  test("a flavor, image or network after its option", () => {
    expect(kind("server create --flavor c")).toBe("flavors");
    expect(kind("server create --image u")).toBe("images");
    expect(kind("server create --network ")).toBe("networks");
  });

  test("nothing where openstack's own words belong", () => {
    expect(kind("server show")).toBeUndefined();
    expect(kind("server list ")).toBeUndefined();
    expect(kind("server show --")).toBeUndefined();
    expect(kind("server show --format ")).toBeUndefined();
    expect(kind("server create my-vm")).toBeUndefined();
  });
});
