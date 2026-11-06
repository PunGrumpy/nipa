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

// Each stream can have its own width, so a test sees which one a table reads.
for (const [name, columns] of [
  ["stdout", process.env.NIPA_TEST_STDOUT_COLUMNS],
  ["stderr", process.env.NIPA_TEST_STDERR_COLUMNS],
] as const) {
  if (columns) {
    Object.defineProperty(process[name], "columns", {
      configurable: true,
      value: Number(columns),
    });
  }
}

await import("../src/index");
