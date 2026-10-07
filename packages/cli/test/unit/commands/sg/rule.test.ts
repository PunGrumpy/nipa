import { describe, expect, test } from "bun:test";

import {
  compareRules,
  exposureNote,
  isExposed,
  ruleCells,
  toRule,
} from "../../../../src/commands/sg/rule";
import type { SecurityGroupRule } from "../../../../src/util/security-group";

const WEB_ID = "ssss2222";
const NAMES = new Map([[WEB_ID, "web"]]);

const raw = (rule: Partial<SecurityGroupRule>): SecurityGroupRule => ({
  direction: "ingress",
  ethertype: "IPv4",
  id: "r1",
  portMax: null,
  portMin: null,
  protocol: "tcp",
  remoteGroupId: null,
  remoteIpPrefix: null,
  ...rule,
});

const row = (rule: Partial<SecurityGroupRule>): string[] =>
  ruleCells(toRule(raw(rule), NAMES)).map((cell) => cell.text);

const tcp = (port: number, remoteIpPrefix = "0.0.0.0/0") =>
  toRule(raw({ portMax: port, portMin: port, remoteIpPrefix }), NAMES);

describe("ruleCells", () => {
  test("one port, a range, and a CIDR", () => {
    expect(
      row({ portMax: 22, portMin: 22, remoteIpPrefix: "192.0.2.0/24" })
    ).toEqual(["tcp", "22", "192.0.2.0/24", "IPv4"]);
    expect(row({ portMax: 32_767, portMin: 30_000, protocol: "udp" })).toEqual([
      "udp",
      "30000-32767",
      "any",
      "IPv4",
    ]);
  });

  test("the whole port range and the any protocol read as any", () => {
    expect(row({ portMax: 65_535, portMin: 0, protocol: "any" })).toEqual([
      "any",
      "any",
      "any",
      "IPv4",
    ]);
    expect(row({ portMax: 65_535, portMin: 1 })[1]).toBe("any");
    expect(row({ portMax: 65_534, portMin: 1 })[1]).toBe("1-65534");
  });

  test("a remote group shows its name, or its ID when it isn't in the project", () => {
    expect(row({ remoteGroupId: WEB_ID })[2]).toBe("group web");
    expect(row({ remoteGroupId: "elsewhere" })[2]).toBe("group elsewhere");
  });

  test("an ICMP rule shows its type and code", () => {
    expect(row({ portMax: 0, portMin: 8, protocol: "icmp" })[1]).toBe(
      "type 8 code 0"
    );
    expect(row({ portMin: 3, protocol: "icmp" })[1]).toBe("type 3");
    expect(row({ protocol: "icmp" })[1]).toBe("any");
  });
});

describe("compareRules", () => {
  test("rules for every port come first, then by port and protocol", () => {
    const rules = [
      tcp(443),
      toRule(raw({ portMax: 53, portMin: 53, protocol: "udp" }), NAMES),
      toRule(raw({ protocol: "any" }), NAMES),
      tcp(22),
      toRule(raw({ portMax: 53, portMin: 53 }), NAMES),
    ];
    expect(
      rules.toSorted(compareRules).map((rule) => ruleCells(rule)[0]?.text)
    ).toEqual(["any", "tcp", "tcp", "udp", "tcp"]);
    expect(
      rules.toSorted(compareRules).map((rule) => ruleCells(rule)[1]?.text)
    ).toEqual(["any", "22", "53", "53", "443"]);
  });
});

describe("exposure", () => {
  test("SSH and RDP open to any IPv4 or IPv6 address are exposed", () => {
    expect(exposureNote([tcp(22), tcp(3389, "::/0")])).toBe(
      "SSH (22) and RDP (3389) are open to the internet."
    );
    expect(isExposed(tcp(22))).toBe(true);
  });

  test("a range names each sensitive port it covers", () => {
    const range = toRule(
      raw({ portMax: 5432, portMin: 3000, remoteIpPrefix: "0.0.0.0/0" }),
      NAMES
    );
    expect(exposureNote([range])).toBe(
      "MySQL (3306), RDP (3389) and PostgreSQL (5432) are open to the internet."
    );
  });

  test("an open rule for every port says so once", () => {
    const all = toRule(raw({ protocol: "any" }), NAMES);
    expect(isExposed(all)).toBe(true);
    expect(exposureNote([all, tcp(22)])).toBe(
      "Every port is open to the internet."
    );
  });

  test("a private source, a web port, UDP or outbound traffic isn't exposed", () => {
    const quiet = [
      tcp(22, "198.51.100.0/24"),
      tcp(443),
      toRule(raw({ portMax: 22, portMin: 22, protocol: "udp" }), NAMES),
      toRule(raw({ direction: "egress", protocol: "any" }), NAMES),
      toRule(raw({ portMax: 22, portMin: 22, remoteGroupId: WEB_ID }), NAMES),
    ];
    expect(quiet.map(isExposed)).toEqual([false, false, false, false, false]);
    expect(exposureNote(quiet)).toBeUndefined();
    expect(exposureNote([...quiet, tcp(22)])).toBe(
      "SSH (22) is open to the internet."
    );
  });
});
