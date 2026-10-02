// Shell completion scripts, generated from the command list the CLI uses, so a
// new command or option completes without editing them. Project names come from
// the hidden `nipa __complete projects` command when the user presses Tab.

/** What follows a flag on the command line. */
export type FlagValue =
  | { kind: "none" }
  | { kind: "text"; name: string }
  | { kind: "choice"; choices: readonly [string, ...string[]] }
  | { kind: "project" };

export interface FlagSpec {
  long: string;
  short?: string;
  description: string;
  value: FlagValue;
}

/** What the positional arguments complete to. Without `args`, nothing. */
export type ArgSpec =
  | { kind: "projects" }
  | { kind: "shells" }
  /** The rest of the line completes as if typed after `program`. */
  | { kind: "program"; program: string }
  /** The next word is a command, and the rest completes as that command. */
  | { kind: "command" };

export interface CommandSpec {
  name: string;
  summary: string;
  aliases?: readonly string[];
  flags?: readonly FlagSpec[];
  args?: ArgSpec;
  hidden?: boolean;
}

export const COMPLETION_SHELLS = ["bash", "zsh", "fish", "pwsh"] as const;

export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

export const isCompletionShell = (value: string): value is CompletionShell =>
  COMPLETION_SHELLS.some((shell) => shell === value);

/** Commands whose arguments belong to another program, including --help. */
export const isPassthrough = (spec: CommandSpec): boolean =>
  spec.args?.kind === "program" || spec.args?.kind === "command";

const visible = (specs: readonly CommandSpec[]) =>
  specs.filter((c) => !c.hidden);

const flagWords = (flag: FlagSpec): string[] =>
  flag.short ? [`--${flag.long}`, `-${flag.short}`] : [`--${flag.long}`];

const names = (spec: CommandSpec): string[] => [
  spec.name,
  ...(spec.aliases ?? []),
];

const PROJECTS_COMMAND = "nipa __complete projects";

// --- bash -------------------------------------------------------------------

/** Project names may contain spaces, so split the list on newlines only. */
const BASH_PROJECTS = `local IFS=$'\\n'; COMPREPLY=($(compgen -W "$(${PROJECTS_COMMAND} 2>/dev/null)" -- "$cur"))`;

const bashWords = (words: readonly string[]): string =>
  `COMPREPLY=($(compgen -W "${words.join(" ")}" -- "$cur"))`;

/** The reply after a flag that takes a value; undefined for flags that don't. */
const bashFlagValue = (value: FlagValue): string | undefined => {
  switch (value.kind) {
    case "none": {
      return undefined;
    }
    case "text": {
      return "COMPREPLY=()";
    }
    case "choice": {
      return bashWords(value.choices);
    }
    case "project": {
      return BASH_PROJECTS;
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

/** `_command_offset` comes from the bash-completion package. Without it, complete file names. */
const bashOffset = (call: string): string =>
  `if declare -F _command_offset >/dev/null; then ${call}; else COMPREPLY=($(compgen -f -- "$cur")); fi`;

const bashArgs = (args: ArgSpec): string => {
  switch (args.kind) {
    case "projects": {
      return BASH_PROJECTS;
    }
    case "shells": {
      return bashWords(COMPLETION_SHELLS);
    }
    case "program": {
      return bashOffset(`COMP_WORDS[1]=${args.program}; _command_offset 1`);
    }
    case "command": {
      return bashOffset("_command_offset 2");
    }
    default: {
      const _exhaustive: never = args;
      return _exhaustive;
    }
  }
};

const bashCase = (spec: CommandSpec): string => {
  const flags = spec.flags ?? [];
  const lines: string[] = [];
  const valued = flags.flatMap((flag) => {
    const reply = bashFlagValue(flag.value);
    return reply === undefined
      ? []
      : [`        ${flagWords(flag).join("|")}) ${reply}; return ;;`];
  });
  if (valued.length > 0) {
    lines.push('      case "$prev" in', ...valued, "      esac");
  }
  if (flags.length > 0) {
    const words = bashWords(flags.flatMap(flagWords));
    lines.push(`      if [[ $cur == -* ]]; then ${words}; return; fi`);
  }
  if (spec.args) {
    lines.push(`      ${bashArgs(spec.args)}`);
  }
  if (lines.length === 0) {
    return "";
  }
  return `    ${names(spec).join("|")})\n${lines.join("\n")}\n      ;;`;
};

const bash = (specs: readonly CommandSpec[]): string => {
  const commands = visible(specs).map((c) => c.name);
  return `# nipa completion for bash
# Load it from ~/.bashrc:  eval "$(nipa completion bash)"
_nipa() {
  local cur=\${COMP_WORDS[COMP_CWORD]} prev=\${COMP_WORDS[COMP_CWORD-1]}
  COMPREPLY=()
  if [[ $COMP_CWORD -eq 1 ]]; then
    ${bashWords([...commands, "--help", "--version"])}
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

/** The `:message:action` part of an _arguments spec. */
const zshFlagValue = (flag: FlagSpec): string => {
  const { value } = flag;
  switch (value.kind) {
    case "none": {
      return "";
    }
    case "text": {
      return `:${value.name}: `;
    }
    case "choice": {
      return `:${flag.long}:(${value.choices.join(" ")})`;
    }
    case "project": {
      return ":project:_nipa_projects";
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

const zshFlag = (flag: FlagSpec): string => {
  const words = flagWords(flag);
  const exclusive = words.length > 1 ? `(${words.join(" ")})` : "";
  const spelled = words.length > 1 ? `{${words.join(",")}}` : words[0];
  return `'${exclusive}'${spelled}'[${zshQuote(flag.description)}]${zshFlagValue(flag)}'`;
};

/** The body of a command's case arm, after `shift words; (( CURRENT-- ))`. */
const zshBody = (spec: CommandSpec): string => {
  const specs = (spec.flags ?? []).map(zshFlag);
  const { args } = spec;
  switch (args?.kind) {
    case undefined: {
      break;
    }
    case "projects": {
      specs.push("'1:project:_nipa_projects'");
      break;
    }
    case "shells": {
      specs.push(`'1:shell:(${COMPLETION_SHELLS.join(" ")})'`);
      break;
    }
    case "program": {
      return `words[1]=${args.program}; _normal`;
    }
    case "command": {
      return "_normal";
    }
    default: {
      const _exhaustive: never = args;
      return _exhaustive;
    }
  }
  return specs.length > 0 ? `_arguments -s ${specs.join(" ")}` : ":";
};

const zshCase = (spec: CommandSpec): string =>
  `    ${names(spec).join("|")}) shift words; (( CURRENT-- )); ${zshBody(spec)} ;;`;

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
  projects=(\${(f)"$(${PROJECTS_COMMAND} 2>/dev/null)"})
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

const FISH_PROJECTS = `'(${PROJECTS_COMMAND} 2>/dev/null)'`;

/** The options after `-l <flag>` that describe its value. */
const fishFlagValue = (value: FlagValue): string => {
  switch (value.kind) {
    case "none": {
      return "";
    }
    case "text": {
      return " -r";
    }
    case "choice": {
      return ` -r -a ${fishQuote(value.choices.join(" "))}`;
    }
    case "project": {
      return ` -r -a ${FISH_PROJECTS}`;
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

/** The `-a` argument for a command's positional arguments. */
const fishArgs = (args: ArgSpec): string => {
  switch (args.kind) {
    case "projects": {
      return FISH_PROJECTS;
    }
    case "shells": {
      return fishQuote(COMPLETION_SHELLS.join(" "));
    }
    case "program": {
      // complete the rest of the line as if it were typed after the program
      return `'(complete -C "${args.program} "(string join " " -- (commandline -opc)[3..])" "(commandline -ct))'`;
    }
    case "command": {
      return "'(__fish_complete_subcommand --fcs-skip=2)'";
    }
    default: {
      const _exhaustive: never = args;
      return _exhaustive;
    }
  }
};

const fishLines = (spec: CommandSpec): string[] => {
  const condition = `'__fish_seen_subcommand_from ${names(spec).join(" ")}'`;
  const lines = (spec.flags ?? []).map((flag) => {
    const short = flag.short ? ` -s ${flag.short}` : "";
    const value = fishFlagValue(flag.value);
    return `complete -c nipa -n ${condition} -l ${flag.long}${short}${value} -d ${fishQuote(flag.description)}`;
  });
  if (spec.args) {
    lines.push(`complete -c nipa -n ${condition} -a ${fishArgs(spec.args)}`);
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

const pwshList = (words: readonly string[]): string =>
  `@(${words.map(pwshQuote).join(", ")})`;

const PWSH_PROJECTS = `@(${PROJECTS_COMMAND} 2>$null)`;

/** The values after a flag, or undefined for flags that take none or free text. */
const pwshFlagValue = (value: FlagValue): string | undefined => {
  switch (value.kind) {
    case "none":
    case "text": {
      return undefined;
    }
    case "choice": {
      return pwshList(value.choices);
    }
    case "project": {
      return PWSH_PROJECTS;
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

/** Positional values; PowerShell can't hand over to another program's completer. */
const pwshArgs = (args: ArgSpec): string | undefined => {
  switch (args.kind) {
    case "projects": {
      return PWSH_PROJECTS;
    }
    case "shells": {
      return pwshList(COMPLETION_SHELLS);
    }
    case "program":
    case "command": {
      return undefined;
    }
    default: {
      const _exhaustive: never = args;
      return _exhaustive;
    }
  }
};

const pwshCase = (spec: CommandSpec): string => {
  const flags = spec.flags ?? [];
  const lines = flags.flatMap((flag) => {
    const values = pwshFlagValue(flag.value);
    if (values === undefined) {
      return [];
    }
    const test = flagWords(flag)
      .map((word) => `$prev -eq ${pwshQuote(word)}`)
      .join(" -or ");
    return [`        if (${test}) { return Complete ${values} }`];
  });
  if (flags.length > 0) {
    const all = pwshList(flags.flatMap(flagWords));
    lines.push(
      `        if ($wordToComplete -like '-*') { return Complete ${all} }`
    );
  }
  const positional = spec.args && pwshArgs(spec.args);
  if (positional) {
    lines.push(`        Complete ${positional}`);
  }
  const body = lines.length > 0 ? lines.join("\n") : "        return";
  return `      { $_ -in ${pwshList(names(spec))} } {\n${body}\n      }`;
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
      const _exhaustive: never = shell;
      return _exhaustive;
    }
  }
};
