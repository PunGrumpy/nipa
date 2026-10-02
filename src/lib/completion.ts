// Shell completion scripts, generated from the command list the CLI uses, so a
// new command or option completes without editing them. Project names come from
// the hidden `nipa __complete projects` command when the user presses Tab.

export interface FlagSpec {
  long: string;
  short?: string;
  description: string;
  /** Fixed values for the flag's argument; `[]` means it takes a free value. */
  values?: readonly string[];
}

/**
 * What the positional arguments complete to:
 * - `projects`: project names from the session
 * - `shells`: the shells `nipa completion` supports
 * - `delegate`: another program's own completion (openstack, terraform or any command)
 */
export type ArgKind = "projects" | "shells" | "delegate";

export interface CommandSpec {
  name: string;
  summary: string;
  aliases?: readonly string[];
  flags?: readonly FlagSpec[];
  args?: ArgKind;
  /** For `delegate`: the program to complete as, or the next word for `exec`. */
  delegateTo?: string;
  hidden?: boolean;
}

export const COMPLETION_SHELLS = ["bash", "zsh", "fish", "pwsh"] as const;

export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

export const isCompletionShell = (value: string): value is CompletionShell =>
  COMPLETION_SHELLS.some((shell) => shell === value);

const visible = (specs: readonly CommandSpec[]) =>
  specs.filter((c) => !c.hidden);

const flagWords = (flag: FlagSpec): string[] =>
  flag.short ? [`--${flag.long}`, `-${flag.short}`] : [`--${flag.long}`];

const takesValue = (flag: FlagSpec): boolean => flag.values !== undefined;

const names = (spec: CommandSpec): string[] => [
  spec.name,
  ...(spec.aliases ?? []),
];

// --- bash -------------------------------------------------------------------

/** Project names may contain spaces, so split the list on newlines only. */
const BASH_PROJECTS =
  'local IFS=$\'\\n\'; COMPREPLY=($(compgen -W "$(nipa __complete projects 2>/dev/null)" -- "$cur"))';

const bashCase = (spec: CommandSpec): string => {
  const pattern = names(spec).join("|");
  const lines: string[] = [];
  const valued = (spec.flags ?? []).filter(takesValue);
  if (valued.length > 0) {
    lines.push('      case "$prev" in');
    for (const flag of valued) {
      const values = (flag.values ?? []).join(" ");
      let reply = "COMPREPLY=()";
      if (values) {
        reply = `COMPREPLY=($(compgen -W "${values}" -- "$cur"))`;
      } else if (flag.long === "project") {
        reply = BASH_PROJECTS;
      }
      lines.push(`        ${flagWords(flag).join("|")}) ${reply}; return ;;`);
    }
    lines.push("      esac");
  }
  const flags = (spec.flags ?? []).flatMap(flagWords).join(" ");
  if (flags) {
    lines.push(
      `      if [[ $cur == -* ]]; then COMPREPLY=($(compgen -W "${flags}" -- "$cur")); return; fi`
    );
  }
  if (spec.args === "projects") {
    lines.push(`      ${BASH_PROJECTS}`);
  } else if (spec.args === "shells") {
    lines.push(
      `      COMPREPLY=($(compgen -W "${COMPLETION_SHELLS.join(" ")}" -- "$cur"))`
    );
  } else if (spec.args === "delegate") {
    // _command_offset comes from the bash-completion package; without it, complete file names.
    const program = spec.delegateTo
      ? `COMP_WORDS[1]=${spec.delegateTo}; _command_offset 1`
      : "_command_offset 2";
    lines.push(
      `      if declare -F _command_offset >/dev/null; then ${program}; else COMPREPLY=($(compgen -f -- "$cur")); fi`
    );
  }
  return lines.length > 0
    ? `    ${pattern})\n${lines.join("\n")}\n      ;;`
    : "";
};

const bash = (specs: readonly CommandSpec[]): string => {
  const commands = visible(specs)
    .map((c) => c.name)
    .join(" ");
  return `# nipa completion for bash
# Load it from ~/.bashrc:  eval "$(nipa completion bash)"
_nipa() {
  local cur=\${COMP_WORDS[COMP_CWORD]} prev=\${COMP_WORDS[COMP_CWORD-1]}
  COMPREPLY=()
  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=($(compgen -W "${commands} --help --version" -- "$cur"))
    return
  fi
  case \${COMP_WORDS[1]} in
${visible(specs).map(bashCase).filter(Boolean).join("\n")}
  esac
}
complete -o default -F _nipa nipa
`;
};

// --- zsh --------------------------------------------------------------------

const zshQuote = (text: string): string =>
  text.replaceAll("'", "'\\''").replaceAll(":", "\\:");

const zshFlag = (flag: FlagSpec): string => {
  const words = flagWords(flag);
  const exclusive = words.length > 1 ? `(${words.join(" ")})` : "";
  const spelled = words.length > 1 ? `{${words.join(",")}}` : words[0];
  let action = "";
  if (flag.values?.length) {
    action = `:${flag.long}:(${flag.values.join(" ")})`;
  } else if (flag.values) {
    action =
      flag.long === "project"
        ? `:${flag.long}:_nipa_projects`
        : `:${flag.long}: `;
  }
  return `'${exclusive}'${spelled}'[${zshQuote(flag.description)}]${action}'`;
};

const zshCase = (spec: CommandSpec): string => {
  const pattern = names(spec).join("|");
  const specs = (spec.flags ?? []).map(zshFlag);
  if (spec.args === "projects") {
    specs.push("'1:project:_nipa_projects'");
  } else if (spec.args === "shells") {
    specs.push(`'1:shell:(${COMPLETION_SHELLS.join(" ")})'`);
  }
  if (spec.args === "delegate") {
    const rename = spec.delegateTo ? `words[1]=${spec.delegateTo}; ` : "";
    return `    ${pattern}) shift words; (( CURRENT-- )); ${rename}_normal ;;`;
  }
  const body = specs.length > 0 ? `_arguments -s ${specs.join(" ")}` : ":";
  return `    ${pattern}) shift words; (( CURRENT-- )); ${body} ;;`;
};

const zsh = (specs: readonly CommandSpec[]): string => {
  const commands = visible(specs)
    .map((c) => `    '${c.name}:${zshQuote(c.summary)}'`)
    .join("\n");
  return `#compdef nipa
# nipa completion for zsh
# Load it from ~/.zshrc, after compinit:  eval "$(nipa completion zsh)"
# Or save it as _nipa in a directory on your $fpath.

_nipa_projects() {
  local -a projects
  projects=(\${(f)"$(nipa __complete projects 2>/dev/null)"})
  _describe -t projects 'project' projects
}

_nipa() {
  local -a commands
  commands=(
${commands}
  )
  if (( CURRENT == 2 )); then
    _describe -t commands 'nipa command' commands
    return
  fi
  case $words[2] in
${visible(specs).map(zshCase).join("\n")}
  esac
}

if [[ $zsh_eval_context[-1] == loadautofunc ]]; then
  _nipa "$@"
else
  compdef _nipa nipa
fi
`;
};

// --- fish -------------------------------------------------------------------

const fishQuote = (text: string): string =>
  `'${text.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

const fishLines = (spec: CommandSpec): string[] => {
  const condition = `'__fish_seen_subcommand_from ${names(spec).join(" ")}'`;
  const lines: string[] = [];
  for (const flag of spec.flags ?? []) {
    const short = flag.short ? ` -s ${flag.short}` : "";
    let value = "";
    if (flag.values?.length) {
      value = ` -r -a ${fishQuote(flag.values.join(" "))}`;
    } else if (flag.values) {
      value =
        flag.long === "project"
          ? " -r -a '(nipa __complete projects 2>/dev/null)'"
          : " -r";
    }
    lines.push(
      `complete -c nipa -n ${condition} -l ${flag.long}${short}${value} -d ${fishQuote(flag.description)}`
    );
  }
  if (spec.args === "projects") {
    lines.push(
      `complete -c nipa -n ${condition} -a '(nipa __complete projects 2>/dev/null)'`
    );
  } else if (spec.args === "shells") {
    lines.push(
      `complete -c nipa -n ${condition} -a ${fishQuote(COMPLETION_SHELLS.join(" "))}`
    );
  } else if (spec.args === "delegate") {
    // complete the rest of the line as if it were typed after the target program
    const target = spec.delegateTo
      ? `(complete -C "${spec.delegateTo} "(string join " " -- (commandline -opc)[3..])" "(commandline -ct))`
      : "(__fish_complete_subcommand --fcs-skip=2)";
    lines.push(`complete -c nipa -n ${condition} -a '${target}'`);
  }
  return lines;
};

const fish = (specs: readonly CommandSpec[]): string => {
  const top = visible(specs).map(
    (c) =>
      `complete -c nipa -n __fish_use_subcommand -a ${c.name} -d ${fishQuote(c.summary)}`
  );
  return `# nipa completion for fish
# Save it:  nipa completion fish > ~/.config/fish/completions/nipa.fish
complete -c nipa -f
complete -c nipa -n __fish_use_subcommand -s h -l help -d 'Show help'
complete -c nipa -n __fish_use_subcommand -s v -l version -d 'Show the version'
${top.join("\n")}
${visible(specs).flatMap(fishLines).join("\n")}
`;
};

// --- PowerShell -------------------------------------------------------------

const pwshQuote = (text: string): string => `'${text.replaceAll("'", "''")}'`;

const pwshCase = (spec: CommandSpec): string => {
  const flags = (spec.flags ?? []).flatMap(flagWords).map(pwshQuote).join(", ");
  const valued = (spec.flags ?? [])
    .filter((f) => f.values?.length)
    .map(
      (f) =>
        `        if (${flagWords(f)
          .map((w) => `$prev -eq ${pwshQuote(w)}`)
          .join(
            " -or "
          )}) { return Complete @(${(f.values ?? []).map(pwshQuote).join(", ")}) }`
    );
  const projectFlag = (spec.flags ?? []).some((f) => f.long === "project");
  if (projectFlag) {
    valued.push(
      "        if ($prev -eq '--project' -or $prev -eq '-p') { return Complete @(nipa __complete projects 2>$null) }"
    );
  }
  let positional = "";
  if (spec.args === "projects") {
    positional = "        Complete @(nipa __complete projects 2>$null)";
  } else if (spec.args === "shells") {
    positional = `        Complete @(${COMPLETION_SHELLS.map(pwshQuote).join(", ")})`;
  }
  const flagLine = flags
    ? `        if ($wordToComplete -like '-*') { return Complete @(${flags}) }`
    : "";
  const body = [...valued, flagLine, positional].filter(Boolean).join("\n");
  const pattern = names(spec).map(pwshQuote).join(", ");
  return `      { $_ -in @(${pattern}) } {\n${body || "        return"}\n      }`;
};

const pwsh = (specs: readonly CommandSpec[]): string => {
  const commands = visible(specs)
    .map((c) => `    ${pwshQuote(c.name)} = ${pwshQuote(c.summary)}`)
    .join("\n");
  return `# nipa completion for PowerShell
# Load it from your $PROFILE:  nipa completion pwsh | Out-String | Invoke-Expression
Register-ArgumentCompleter -Native -CommandName nipa -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $commands = [ordered]@{
${commands}
  }
  function Complete([string[]]$values, [hashtable]$descriptions = @{}) {
    $values | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
      $tip = if ($descriptions[$_]) { $descriptions[$_] } else { $_ }
      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $tip)
    }
  }
  $words = @($commandAst.CommandElements | ForEach-Object { $_.ToString() })
  # the word being completed is either the last element or a new, empty one
  $index = if ($wordToComplete) { $words.Count - 1 } else { $words.Count }
  if ($index -le 1) { return Complete ([string[]]$commands.Keys) $commands }
  $prev = $words[$index - 1]
  switch ($words[1]) {
${visible(specs).map(pwshCase).join("\n")}
  }
}
`;
};

export const completionScript = (
  shell: CompletionShell,
  specs: readonly CommandSpec[]
): string => {
  switch (shell) {
    case "bash": {
      return bash(specs);
    }
    case "zsh": {
      return zsh(specs);
    }
    case "fish": {
      return fish(specs);
    }
    case "pwsh": {
      return pwsh(specs);
    }
    default: {
      throw new Error(`unknown shell: ${shell satisfies never}`);
    }
  }
};
