import { describe, expect, test } from "bun:test";

import { closest, closestBy, editDistance } from "../../../src/util/suggest";

describe("editDistance", () => {
  test("counts insertions, deletions and substitutions", () => {
    expect(editDistance("server", "server")).toBe(0);
    expect(editDistance("sever", "server")).toBe(1);
    expect(editDistance("serverr", "server")).toBe(1);
    expect(editDistance("sarver", "server")).toBe(1);
    expect(editDistance("abc", "xyz")).toBe(3);
  });
  test("counts two swapped neighbors as one edit", () => {
    expect(editDistance("jsno", "json")).toBe(1);
    expect(editDistance("lgoin", "login")).toBe(1);
  });
});

describe("closest", () => {
  test("a word that differs only by case is close, at any length", () => {
    expect(closest("Web-1", ["web-1", "db-1"])).toBe("web-1");
    expect(closest("LS", ["ls", "rm"])).toBe("ls");
    expect(closest("BETA", ["Beta", "Prod"])).toBe("Beta");
  });
  test("a word of up to 4 letters may be 1 edit away, not 2", () => {
    expect(closest("logn", ["login"])).toBe("login");
    expect(closest("lgoin", ["login"])).toBe("login");
    expect(closest("lgon", ["login"])).toBeUndefined();
    expect(closest("lgn", ["login"])).toBeUndefined();
    expect(closest("logs", ["login"])).toBeUndefined();
  });
  test("a word of 5 to 8 letters may be 2 edits away, not 3", () => {
    expect(closest("sever", ["server"])).toBe("server");
    expect(closest("sevrr", ["server"])).toBe("server");
    expect(closest("sevr1", ["server"])).toBeUndefined();
    expect(closest("lgot1234", ["logout1234"])).toBe("logout1234");
    expect(closest("lgot123", ["logout1234"])).toBeUndefined();
  });
  test("a word of 9 letters or more may be 3 edits away, not 4", () => {
    expect(closest("machinetypes", ["machine-types"])).toBe("machine-types");
    expect(closest("securitgrups", ["security-groups"])).toBe(
      "security-groups"
    );
    expect(closest("securitgrop", ["security-groups"])).toBeUndefined();
  });
  test("a word of 1 or 2 letters gets no suggestion by distance", () => {
    expect(closest("l", ["ls"])).toBeUndefined();
    expect(closest("lx", ["ls", "rm"])).toBeUndefined();
    expect(closest("5", ["ls"])).toBeUndefined();
    expect(closest("-v", ["ls", "rm"])).toBeUndefined();
  });
  test("a tie suggests nothing", () => {
    expect(closest("stark", ["start", "stars"])).toBeUndefined();
    expect(closest("stat", ["start", "stop", "state"])).toBeUndefined();
    expect(closest("web-2", ["web-1", "web-3"])).toBeUndefined();
  });
  test("the same name listed twice is one candidate", () => {
    expect(closest("web1", ["web-1", "web-1"])).toBe("web-1");
  });
  test("a closer candidate beats a farther one", () => {
    expect(closest("starr", ["start", "stop"])).toBe("start");
  });
  test("no candidates, no suggestion", () => {
    expect(closest("server", [])).toBeUndefined();
  });
});

describe("closestBy", () => {
  const items = [
    { name: "flavor", words: ["flavor", "flavors", "machine-types"] },
    { name: "login", words: ["login"] },
  ];
  test("an item counts once, at its closest word", () => {
    expect(closestBy("flavorz", items, (i) => i.words)?.name).toBe("flavor");
    expect(closestBy("machine-type", items, (i) => i.words)?.name).toBe(
      "flavor"
    );
  });
  test("two items equally close suggest nothing", () => {
    const pair = [{ words: ["start"] }, { words: ["stars"] }];
    expect(closestBy("stark", pair, (i) => i.words)).toBeUndefined();
  });
});
