// Runs the CLI as if the streams in NIPA_TEST_TTY (stdin, stdout, stderr,
// comma separated) were terminals, while the others stay what the test gave
// them. Everything after the script name is the CLI's own command line.

const names = (process.env.NIPA_TEST_TTY ?? "").split(",");

for (const name of ["stdin", "stdout", "stderr"] as const) {
  if (names.includes(name)) {
    Object.defineProperty(process[name], "isTTY", {
      configurable: true,
      value: true,
    });
  }
}

await import("../src/index");
