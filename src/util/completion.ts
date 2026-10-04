// The four completion scripts, generated from the specs. A command's kind
// says what follows it: a group's subcommands, a leaf's flags and its first
// argument with values to offer, or a passthrough program's own words.

import { GLOBAL_FLAGS, profileFlag } from "./arg-common";
import { flagWords, namesOf, visibleCommands } from "./spec";
import type {
  ArgSpec,
  ArgValue,
  CommandSpec,
  FlagSpec,
  FlagValue,
  LeafSpec,
  ProgramSpec,
  Target,
} from "./spec";

export const COMPLETION_SHELLS = ["bash", "zsh", "fish", "pwsh"] as const;

export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

/** The words `nipa __complete` takes. The scripts run it for values only nipa knows. */
export const COMPLETE_KINDS = ["projects", "profiles", "openstack"] as const;

export type CompleteKind = (typeof COMPLETE_KINDS)[number];

type DynamicKind = Exclude<CompleteKind, "openstack">;

const dynamic = (kind: DynamicKind): string => `nipa __complete ${kind}`;

const PROFILE_WORDS = flagWords(profileFlag);

const passthroughNames = (specs: readonly CommandSpec[]): string[] =>
  specs
    .filter((spec) => spec.kind === "passthrough")
    .flatMap((spec) => namesOf(spec));

const allFlags = (spec: LeafSpec): FlagSpec[] => [
  ...spec.flags,
  ...GLOBAL_FLAGS,
];

/** The leaf's first argument with values to offer, and its position for zsh. */
interface Offered {
  readonly arg: ArgSpec;
  readonly position: number;
}

const offered = (spec: LeafSpec): Offered | undefined => {
  const index = spec.args.findIndex((arg) => arg.value.kind !== "text");
  const arg = spec.args[index];
  return arg ? { arg, position: index + 1 } : undefined;
};

const bashValue = (value: FlagValue): string | undefined => {
  switch (value.kind) {
    case "none": {
      return undefined;
    }
    case "text": {
      return "return";
    }
    case "choice": {
      return `_nipa_reply ${value.choices.join(" ")}; return`;
    }
    case "project": {
      return `_nipa_reply "$(${dynamic("projects")} 2>/dev/null)"; return`;
    }
    case "profile": {
      return `_nipa_reply "$(${dynamic("profiles")} 2>/dev/null)"; return`;
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

const bashArg = (value: ArgValue): string | undefined => {
  switch (value.kind) {
    case "text": {
      return undefined;
    }
    case "project": {
      return `_nipa_reply "$(${dynamic("projects")} 2>/dev/null)"`;
    }
    case "profile": {
      return `_nipa_reply "$(${dynamic("profiles")} 2>/dev/null)"`;
    }
    case "choice": {
      return `_nipa_reply ${value.choices.join(" ")}`;
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

const bashTarget = (target: Target): string => {
  switch (target.kind) {
    case "program": {
      return `COMP_WORDS[i]=${target.program}; _nipa_offset "$i"`;
    }
    case "command": {
      return '_nipa_offset "$((i + 1))"';
    }
    case "openstack": {
      return `_nipa_reply "$(nipa __complete openstack -- "\${COMP_WORDS[@]:i+1:COMP_CWORD-i}" 2>/dev/null)"`;
    }
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
};

const bashArm = (spec: CommandSpec, depth: number): string => {
  const pad = "  ".repeat(depth * 2 + 2);
  const lines: string[] = [];
  if (spec.kind === "group") {
    const subs = spec.subcommands;
    lines.push(
      `if [[ $COMP_CWORD -eq $((i + 1)) ]]; then _nipa_reply ${subs.map((s) => s.name).join(" ")}; return; fi`,
      `case \${COMP_WORDS[i + 1]} in`,
      ...subs.map((sub) => bashArm(sub, depth + 1)),
      "esac"
    );
  } else if (spec.kind === "passthrough") {
    lines.push(bashTarget(spec.target));
  } else {
    const flags = allFlags(spec);
    const valued = flags.flatMap((flag) => {
      const reply = bashValue(flag.value);
      return reply === undefined
        ? []
        : [`  ${flagWords(flag).join("|")}) ${reply} ;;`];
    });
    if (valued.length > 0) {
      lines.push('case "$prev" in', ...valued, "esac");
    }
    const words = flags.flatMap(flagWords).join(" ");
    lines.push(`if [[ $cur == -* ]]; then _nipa_reply ${words}; return; fi`);
    const arg = offered(spec);
    const reply = arg && bashArg(arg.arg.value);
    if (reply) {
      lines.push(reply);
    }
  }
  const body = lines.map((line) => `${pad}  ${line}`).join("\n");
  return `${pad}${namesOf(spec).join("|")})\n${body}\n${pad}  ;;`;
};

const bash = (program: ProgramSpec): string => {
  const shown = visibleCommands(program);
  const commands = shown.map((c) => c.name).join(" ");
  const globals = GLOBAL_FLAGS.flatMap(flagWords).join(" ");
  return `# nipa completion for bash
# Load it from ~/.bashrc:  eval "$(nipa completion bash)"

# One word per line, so project names with spaces stay whole.
_nipa_reply() {
  local IFS=$'\\n'
  COMPREPLY=($(compgen -W "$*" -- "$cur"))
}

# _command_offset comes from the bash-completion package.
_nipa_offset() {
  if declare -F _command_offset >/dev/null; then
    _command_offset "$1"
  else
    COMPREPLY=($(compgen -f -- "$cur"))
  fi
}

_nipa() {
  local cur=\${COMP_WORDS[COMP_CWORD]} prev=\${COMP_WORDS[COMP_CWORD-1]}
  COMPREPLY=()
  local i=1 command=""
  while [[ $i -lt $COMP_CWORD ]]; do
    case \${COMP_WORDS[i]} in
      ${PROFILE_WORDS.join("|")}) ((i += 2)) ;;
      -*) ((i += 1)) ;;
      *) command=\${COMP_WORDS[i]}; break ;;
    esac
  done
  if [[ -z $command ]]; then
    case $prev in
      ${PROFILE_WORDS.join("|")}) _nipa_reply "$(${dynamic("profiles")} 2>/dev/null)"; return ;;
    esac
    if [[ $cur == -* ]]; then _nipa_reply ${globals}; else _nipa_reply ${commands}; fi
    return
  fi
  case $command in
${shown.map((spec) => bashArm(spec, 0)).join("\n")}
  esac
}
complete -o default -F _nipa nipa
`;
};

const zshQuote = (text: string): string =>
  text.replaceAll("'", "'\\''").replaceAll(":", "\\:");

const zshValue = (flag: FlagSpec): string => {
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
      return ":project:{_nipa_dynamic projects project}";
    }
    case "profile": {
      return ":profile:{_nipa_dynamic profiles profile}";
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
  return `'${exclusive}'${spelled}'[${zshQuote(flag.description)}]${zshValue(flag)}'`;
};

const zshArg = ({ arg, position }: Offered): string => {
  const { value } = arg;
  switch (value.kind) {
    case "project": {
      return `'${position}:project:{_nipa_dynamic projects project}'`;
    }
    case "profile": {
      return `'${position}:profile:{_nipa_dynamic profiles profile}'`;
    }
    case "choice": {
      return `'${position}:${arg.name}:(${value.choices.join(" ")})'`;
    }
    case "text": {
      return "";
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

const zshTarget = (target: Target, pad: string): string => {
  switch (target.kind) {
    case "program": {
      return `${pad}  words[1]=${target.program}; _normal`;
    }
    case "command": {
      return `${pad}  shift words; (( CURRENT-- )); _normal`;
    }
    case "openstack": {
      return `${pad}  _nipa_openstack`;
    }
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
};

/** On entry, words[1] is this command's name. */
const zshBody = (spec: CommandSpec, pad: string): string => {
  if (spec.kind === "group") {
    const subs = spec.subcommands;
    const described = subs
      .map((s) => `'${s.name}:${zshQuote(s.summary)}'`)
      .join(" ");
    const arms = subs
      .map((sub) => {
        const body = zshBody(sub, `${pad}    `);
        return `${pad}    ${namesOf(sub).join("|")})\n${body}\n${pad}      ;;`;
      })
      .join("\n");
    return [
      `${pad}  if (( CURRENT == 2 )); then`,
      `${pad}    local -a subcommands; subcommands=(${described})`,
      `${pad}    _describe -t subcommands '${spec.name} subcommand' subcommands; return`,
      `${pad}  fi`,
      `${pad}  shift words; (( CURRENT-- ))`,
      `${pad}  case $words[1] in`,
      arms,
      `${pad}  esac`,
    ].join("\n");
  }
  if (spec.kind === "passthrough") {
    return zshTarget(spec.target, pad);
  }
  const arg = offered(spec);
  const specs = [...allFlags(spec).map(zshFlag), arg ? zshArg(arg) : ""];
  return `${pad}  _arguments -s ${specs.filter(Boolean).join(" ")}`;
};

const zsh = (program: ProgramSpec): string => {
  const shown = visibleCommands(program);
  const commands = shown
    .map((c) => `    '${c.name}:${zshQuote(c.summary)}'`)
    .join("\n");
  const globals = GLOBAL_FLAGS.flatMap((flag) =>
    flagWords(flag).map((word) => `    '${word}:${zshQuote(flag.description)}'`)
  ).join("\n");
  const arms = shown
    .map(
      (spec) =>
        `    ${namesOf(spec).join("|")})\n${zshBody(spec, "    ")}\n      ;;`
    )
    .join("\n");
  return `#compdef nipa
# nipa completion for zsh
# Load it from ~/.zshrc, after compinit:  eval "$(nipa completion zsh)"
# Or save it as _nipa in a directory on your $fpath.

_nipa_dynamic() {
  local -a values
  values=(\${(f)"$(nipa __complete $1 2>/dev/null)"})
  _describe -t $1 $2 values
}

_nipa_openstack() {
  local -a values
  values=(\${(f)"$(nipa __complete openstack -- "\${(@)words[2,CURRENT-1]}" "$PREFIX" 2>/dev/null)"})
  if (( $#values )); then compadd -a values; else _files; fi
}

_nipa() {
  local i=2 command=""
  while (( i < CURRENT )); do
    case $words[i] in
      ${PROFILE_WORDS.join("|")}) (( i += 2 )) ;;
      -*) (( i += 1 )) ;;
      *) command=$words[i]; break ;;
    esac
  done
  if [[ -z $command ]]; then
    if [[ $words[CURRENT-1] == (${PROFILE_WORDS.join("|")}) ]]; then
      _nipa_dynamic profiles profile
    elif [[ $PREFIX == -* ]]; then
      local -a globals; globals=(
${globals}
      )
      _describe -t options 'global option' globals
    else
      local -a commands; commands=(
${commands}
      )
      _describe -t commands 'nipa command' commands
    fi
    return
  fi
  # Drop nipa and any global options, so words[1] is the command.
  shift $(( i - 1 )) words; (( CURRENT -= i - 1 ))
  case $command in
${arms}
  esac
}

if [[ $zsh_eval_context[-1] == loadautofunc ]]; then
  _nipa "$@"
else
  compdef _nipa nipa
fi
`;
};

const fishQuote = (text: string): string =>
  `'${text.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

const fishDynamic = (kind: DynamicKind): string =>
  `'(${dynamic(kind)} 2>/dev/null)'`;

const fishValue = (value: FlagValue): string => {
  switch (value.kind) {
    case "none": {
      return "";
    }
    case "text": {
      return " --exclusive";
    }
    case "choice": {
      return ` --exclusive -a ${fishQuote(value.choices.join(" "))}`;
    }
    case "project": {
      return ` --exclusive -a ${fishDynamic("projects")}`;
    }
    case "profile": {
      return ` --exclusive -a ${fishDynamic("profiles")}`;
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

const fishArg = (value: ArgValue): string | undefined => {
  switch (value.kind) {
    case "text": {
      return undefined;
    }
    case "project": {
      return fishDynamic("projects");
    }
    case "profile": {
      return fishDynamic("profiles");
    }
    case "choice": {
      return fishQuote(value.choices.join(" "));
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

const fishTarget = (target: Target): string => {
  switch (target.kind) {
    case "program": {
      return `'(__nipa_complete_as ${target.program})'`;
    }
    case "command": {
      return "'(__nipa_complete_as)'";
    }
    case "openstack": {
      return "'(__nipa_openstack)'";
    }
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
};

/** Positional values for a leaf, or the hand-over for a passthrough. */
const fishValues = (
  spec: LeafSpec | Extract<CommandSpec, { kind: "passthrough" }>
): string | undefined => {
  if (spec.kind === "passthrough") {
    return fishTarget(spec.target);
  }
  const arg = offered(spec);
  return arg && fishArg(arg.arg.value);
};

const fishFlag = (flag: FlagSpec, condition: string): string => {
  const short = flag.short ? ` -s ${flag.short}` : "";
  return `complete -c nipa -n ${fishQuote(condition)}${short} -l ${flag.long}${fishValue(flag.value)} -d ${fishQuote(flag.description)}`;
};

const fishLines = (spec: CommandSpec, parent?: CommandSpec): string[] => {
  const using = `__nipa_using ${namesOf(parent ?? spec).join(" ")}`;
  const condition = parent
    ? `${using}; and __fish_seen_subcommand_from ${namesOf(spec).join(" ")}`
    : using;
  if (spec.kind === "group") {
    const subs = spec.subcommands;
    const none = `${condition}; and not __fish_seen_subcommand_from ${subs.flatMap((sub) => namesOf(sub)).join(" ")}`;
    return [
      ...subs.map(
        (sub) =>
          `complete -c nipa -n ${fishQuote(none)} -a ${sub.name} -d ${fishQuote(sub.summary)}`
      ),
      ...subs.flatMap((sub) => fishLines(sub, spec)),
    ];
  }
  const own = spec.kind === "leaf" ? spec.flags : [];
  const flags = own.map((flag) => fishFlag(flag, condition));
  const values = fishValues(spec);
  const args = values
    ? [`complete -c nipa -n ${fishQuote(condition)} -a ${values}`]
    : [];
  return [...flags, ...args];
};

const fish = (program: ProgramSpec): string => {
  const shown = visibleCommands(program);
  const all = [...shown, ...program.hidden];
  const notPassthrough = `not __nipa_using ${passthroughNames(all).join(" ")}`;
  const top = shown.map(
    (c) =>
      `complete -c nipa -n __nipa_needs_command -a ${c.name} -d ${fishQuote(c.summary)}`
  );
  return `# nipa completion for fish
# Save it:  nipa completion fish > ~/.config/fish/completions/nipa.fish

function __nipa_command_index
    set -l tokens (commandline -opc)
    set -l i 2
    while test $i -le (count $tokens)
        switch $tokens[$i]
            case ${PROFILE_WORDS.join(" ")}
                set i (math $i + 2)
            case '-*'
                set i (math $i + 1)
            case '*'
                echo $i
                return 0
        end
    end
    return 1
end

function __nipa_needs_command
    not __nipa_command_index >/dev/null
end

function __nipa_using
    set -l i (__nipa_command_index); or return 1
    set -l tokens (commandline -opc)
    contains -- $tokens[$i] $argv
end

function __nipa_complete_as
    set -l i (__nipa_command_index); or return
    set -l tokens (commandline -opc)
    set -l line $argv $tokens[(math $i + 1)..-1] (commandline -ct)
    complete -C "$line"
end

function __nipa_openstack
    set -l i (__nipa_command_index); or return
    set -l tokens (commandline -opc)
    set -l values (nipa __complete openstack -- $tokens[(math $i + 1)..-1] (commandline -ct) 2>/dev/null)
    if set -q values[1]
        printf '%s\\n' $values
    else
        __fish_complete_path (commandline -ct)
    end
end

complete -c nipa -f
${GLOBAL_FLAGS.map((flag) => fishFlag(flag, notPassthrough)).join("\n")}
${top.join("\n")}
${shown.flatMap((spec) => fishLines(spec)).join("\n")}
`;
};

const pwshQuote = (text: string): string => `'${text.replaceAll("'", "''")}'`;

const pwshList = (words: readonly string[]): string =>
  `@(${words.map(pwshQuote).join(", ")})`;

const pwshValue = (value: FlagValue): string | undefined => {
  switch (value.kind) {
    case "none":
    case "text": {
      return undefined;
    }
    case "choice": {
      return pwshList(value.choices);
    }
    case "project": {
      return "(Dynamic projects)";
    }
    case "profile": {
      return "(Dynamic profiles)";
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

const pwshArg = (value: ArgValue): string | undefined => {
  switch (value.kind) {
    case "text": {
      return undefined;
    }
    case "project": {
      return "(Dynamic projects)";
    }
    case "profile": {
      return "(Dynamic profiles)";
    }
    case "choice": {
      return pwshList(value.choices);
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

/** PowerShell can't hand over to another program's completer. */
const pwshTarget = (target: Target): string | undefined => {
  switch (target.kind) {
    case "openstack": {
      return "(Openstack ($c + 1))";
    }
    case "program":
    case "command": {
      return undefined;
    }
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
};

/** `$c` is the position of this spec's word. */
const pwshBody = (spec: CommandSpec, pad: string): string => {
  if (spec.kind === "group") {
    const subs = spec.subcommands;
    const tips = subs
      .map((s) => `${pwshQuote(s.name)} = ${pwshQuote(s.summary)}`)
      .join("; ");
    const arms = subs
      .map((sub) => {
        const body = pwshBody(sub, `${pad}    `);
        return `${pad}    { $_ -in ${pwshList(namesOf(sub))} } {\n${pad}      $c += 1\n${body}\n${pad}    }`;
      })
      .join("\n");
    return [
      `${pad}  if ($index -eq $c + 1) { return Complete ${pwshList(subs.map((s) => s.name))} @{ ${tips} } }`,
      `${pad}  switch ($words[$c + 1]) {`,
      arms,
      `${pad}  }`,
    ].join("\n");
  }
  if (spec.kind === "passthrough") {
    const values = pwshTarget(spec.target);
    return values ? `${pad}  return Complete ${values}` : `${pad}  return`;
  }
  const flags = allFlags(spec);
  const lines = flags.flatMap((flag) => {
    const values = pwshValue(flag.value);
    return values === undefined
      ? []
      : [
          `if ($prev -in ${pwshList(flagWords(flag))}) { return Complete ${values} }`,
        ];
  });
  lines.push(
    `if ($wordToComplete -like '-*') { return Complete ${pwshList(flags.flatMap(flagWords))} }`
  );
  const arg = offered(spec);
  const positional = arg && pwshArg(arg.arg.value);
  if (positional) {
    lines.push(`Complete ${positional}`);
  }
  return lines.map((line) => `${pad}  ${line}`).join("\n");
};

const pwsh = (program: ProgramSpec): string => {
  const shown = visibleCommands(program);
  const commands = shown
    .map((c) => `    ${pwshQuote(c.name)} = ${pwshQuote(c.summary)}`)
    .join("\n");
  const arms = shown
    .map(
      (spec) =>
        `    { $_ -in ${pwshList(namesOf(spec))} } {\n${pwshBody(spec, "    ")}\n    }`
    )
    .join("\n");
  return `# nipa completion for PowerShell
# Load it from your $PROFILE:  nipa completion pwsh | Out-String | Invoke-Expression
Register-ArgumentCompleter -Native -CommandName nipa -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $commands = [ordered]@{
${commands}
  }
  function Complete([string[]]$values, [hashtable]$tips = @{}) {
    $values | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
      $tip = if ($tips[$_]) { $tips[$_] } else { $_ }
      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $tip)
    }
  }
  function Dynamic([string]$kind) { @(nipa __complete $kind 2>$null) }
  function Openstack([int]$start) {
    $typed = @($words | Select-Object -Skip $start -First ($index - $start))
    @(nipa __complete openstack -- @typed $wordToComplete 2>$null)
  }
  $words = @($commandAst.CommandElements | ForEach-Object { $_.ToString() })
  # The word being completed is either the last element or a new, empty one.
  $index = if ($wordToComplete) { $words.Count - 1 } else { $words.Count }
  $prev = if ($index -ge 1) { $words[$index - 1] } else { '' }
  $c = 1
  $command = $null
  while ($c -lt $index) {
    if ($words[$c] -in ${pwshList(PROFILE_WORDS)}) { $c += 2 }
    elseif ($words[$c] -like '-*') { $c += 1 }
    else { $command = $words[$c]; break }
  }
  if (-not $command) {
    if ($prev -in ${pwshList(PROFILE_WORDS)}) { return Complete (Dynamic profiles) }
    if ($wordToComplete -like '-*') { return Complete ${pwshList(GLOBAL_FLAGS.flatMap(flagWords))} }
    return Complete ([string[]]$commands.Keys) $commands
  }
  switch ($command) {
${arms}
  }
}
`;
};

export const completionScript = (input: {
  program: ProgramSpec;
  shell: CompletionShell;
}): string => {
  const { program, shell } = input;
  switch (shell) {
    case "bash": {
      return bash(program);
    }
    case "zsh": {
      return zsh(program);
    }
    case "fish": {
      return fish(program);
    }
    case "pwsh": {
      return pwsh(program);
    }
    default: {
      const _exhaustive: never = shell;
      return _exhaustive;
    }
  }
};
