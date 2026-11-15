// The four completion scripts, generated from the specs. A command's kind
// says what follows it: a group's subcommands, a leaf's flags and its first
// argument with values to offer, or a passthrough program's own words.

import { GLOBAL_FLAGS } from "./arg-common";
import { flagWords, namesOf, RESOURCE_KINDS, visibleCommands } from "./spec";
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
export const COMPLETE_KINDS = [
  "projects",
  "profiles",
  "openstack",
  ...RESOURCE_KINDS,
] as const;

export type CompleteKind = (typeof COMPLETE_KINDS)[number];

type DynamicKind = Exclude<CompleteKind, "openstack">;

// A global option with a value takes the next word, so the scripts step over
// both to find the command. After one, they offer its values.
const VALUED_GLOBALS = GLOBAL_FLAGS.filter(
  (flag) => flag.value.kind !== "none"
);
const VALUED_WORDS = VALUED_GLOBALS.flatMap(flagWords);

/** The `__complete` kind and zsh's tag for a global option's value, if nipa can list it. */
const globalValues = (
  flag: FlagSpec
): { kind: "profiles" | "projects"; tag: string } | undefined => {
  switch (flag.value.kind) {
    case "profile": {
      return { kind: "profiles", tag: "profile" };
    }
    case "project": {
      return { kind: "projects", tag: "project" };
    }
    default: {
      return undefined;
    }
  }
};

const passthroughNames = (specs: readonly CommandSpec[]): string[] =>
  specs
    .filter((spec) => spec.kind === "passthrough")
    .flatMap((spec) => namesOf(spec));

// The global options that pick where names come from: the profile and the
// project. Each script collects them from the words before the cursor and
// runs `nipa <them> __complete <kind>`, so `nipa -p Beta server inspect <Tab>`
// offers Beta's servers. Words after `--`, or after a passthrough command
// such as `os`, are the other program's.
const SCOPE_FLAGS = VALUED_GLOBALS.filter(
  (flag) => globalValues(flag) !== undefined
);
const SCOPE_WORDS = SCOPE_FLAGS.flatMap(flagWords);
/** `--profile=staging`: the spelling with its value in the same word. */
const SCOPE_JOINED = SCOPE_FLAGS.map((flag) => `--${flag.long}=*`);

const programPassthroughs = (program: ProgramSpec): string[] =>
  passthroughNames([...visibleCommands(program), ...program.hidden]);

/** bash's call; `nipa_scope` is `_nipa`'s, filled by `_nipa_scope`. */
const dynamic = (kind: DynamicKind): string =>
  `nipa \${nipa_scope[@]+"\${nipa_scope[@]}"} __complete ${kind}`;

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
      return `_nipa_reply_lines < <(${dynamic("projects")} 2>/dev/null); return`;
    }
    case "profile": {
      return `_nipa_reply_lines < <(${dynamic("profiles")} 2>/dev/null); return`;
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
      return `_nipa_reply_lines < <(${dynamic("projects")} 2>/dev/null)`;
    }
    case "profile": {
      return `_nipa_reply_lines < <(${dynamic("profiles")} 2>/dev/null)`;
    }
    case "resource": {
      return `_nipa_reply_lines < <(${dynamic(value.resource)} 2>/dev/null)`;
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
      return `_nipa_reply_lines < <(nipa \${nipa_scope[@]+"\${nipa_scope[@]}"} __complete openstack -- "\${COMP_WORDS[@]:i+1:COMP_CWORD-i}" 2>/dev/null)`;
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
  const passthroughs = programPassthroughs(program);
  const commands = shown.map((c) => c.name).join(" ");
  const globals = GLOBAL_FLAGS.flatMap(flagWords).join(" ");
  const bashGlobalValues = VALUED_GLOBALS.flatMap((flag) => {
    const offer = globalValues(flag);
    return offer
      ? [
          `      ${flagWords(flag).join("|")}) _nipa_reply_lines < <(${dynamic(offer.kind)} 2>/dev/null); return ;;`,
        ]
      : [];
  }).join("\n");
  return `# nipa completion for bash
# Load it from ~/.bashrc:  eval "$(nipa completion bash)"

# One word per line, so project names with spaces stay whole.
_nipa_reply() {
  local IFS=$'\\n'
  COMPREPLY=($(compgen -W "$*" -- "$cur"))
}

# Names from nipa, one per line, kept literal: compgen -W would expand
# $(…) and $VAR inside a name. Each match is escaped for the command line.
_nipa_reply_lines() {
  local line
  COMPREPLY=()
  while IFS= read -r line; do
    if [[ $line == "$cur"* ]]; then COMPREPLY+=("$(printf '%q' "$line")"); fi
  done
}

# A word as the shell passes it on: quotes and backslashes removed, nothing
# expanded or run. COMP_WORDS keeps each word as it was typed.
_nipa_unquote() {
  local word=$1 quote="" c next i
  REPLY=""
  for ((i = 0; i < \${#word}; i++)); do
    c=\${word:i:1}
    next=\${word:i+1:1}
    if [[ $quote == "'" ]]; then
      if [[ $c == "'" ]]; then quote=""; else REPLY+=$c; fi
    elif [[ $c == '\\' && -n $next && ( -z $quote || $next == '$' || $next == '\`' || $next == '"' || $next == '\\' ) ]]; then
      REPLY+=$next
      ((i += 1))
    elif [[ $c == '"' ]]; then
      if [[ -n $quote ]]; then quote=""; else quote='"'; fi
    elif [[ $c == "'" && -z $quote ]]; then
      quote="'"
    else
      REPLY+=$c
    fi
  done
}

# The profile and project options before the cursor, into _nipa's nipa_scope.
# COMP_WORDBREAKS splits --profile=x into --profile, = and x.
_nipa_scope() {
  local j=1 command="" word REPLY
  nipa_scope=()
  while [[ $j -lt $COMP_CWORD ]]; do
    word=\${COMP_WORDS[j]}
    case $word in
      --) return ;;
      ${SCOPE_WORDS.join("|")})
        if [[ \${COMP_WORDS[j + 1]} == = ]]; then
          if [[ $((j + 2)) -lt $COMP_CWORD ]]; then _nipa_unquote "\${COMP_WORDS[j + 2]}"; nipa_scope+=("$word=$REPLY"); fi
          ((j += 3))
        else
          if [[ $((j + 1)) -lt $COMP_CWORD ]]; then _nipa_unquote "\${COMP_WORDS[j + 1]}"; nipa_scope+=("$word" "$REPLY"); fi
          ((j += 2))
        fi
        continue ;;
      ${SCOPE_JOINED.join("|")})
        _nipa_unquote "\${word#*=}"; nipa_scope+=("\${word%%=*}=$REPLY") ;;
      -*) ;;
      *)
        if [[ -z $command ]]; then
          command=$word
          case $command in ${passthroughs.join("|")}) return ;; esac
        fi ;;
    esac
    ((j += 1))
  done
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
  local -a nipa_scope
  _nipa_scope
  local i=1 command=""
  while [[ $i -lt $COMP_CWORD ]]; do
    case \${COMP_WORDS[i]} in
      ${VALUED_WORDS.join("|")}) if [[ \${COMP_WORDS[i + 1]} == = ]]; then ((i += 3)); else ((i += 2)); fi ;;
      -*) ((i += 1)) ;;
      *) command=\${COMP_WORDS[i]}; break ;;
    esac
  done
  if [[ -z $command ]]; then
    case $prev in
${bashGlobalValues}
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
    case "resource": {
      return `'${position}:${arg.name}:{_nipa_dynamic ${value.resource} ${arg.name}}'`;
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
  const passthroughs = programPassthroughs(program);
  const commands = shown
    .map((c) => `    '${c.name}:${zshQuote(c.summary)}'`)
    .join("\n");
  const globals = GLOBAL_FLAGS.flatMap((flag) =>
    flagWords(flag).map((word) => `    '${word}:${zshQuote(flag.description)}'`)
  ).join("\n");
  const zshGlobalValues = VALUED_GLOBALS.flatMap((flag, index) => {
    const offer = globalValues(flag);
    return offer
      ? [
          `    ${index === 0 ? "if" : "elif"} [[ $words[CURRENT-1] == (${flagWords(flag).join("|")}) ]]; then\n      _nipa_dynamic ${offer.kind} ${offer.tag}`,
        ]
      : [];
  }).join("\n");
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

# The profile and project options before the cursor, into _nipa's nipa_scope,
# with the quotes as typed removed.
_nipa_scope() {
  local j=2 command=""
  nipa_scope=()
  while (( j < CURRENT )); do
    case $words[j] in
      (--) return ;;
      (${SCOPE_WORDS.join("|")})
        if (( j + 1 < CURRENT )); then nipa_scope+=("$words[j]" "\${(Q)words[j + 1]}"); fi
        (( j += 2 )); continue ;;
      (${SCOPE_JOINED.join("|")}) nipa_scope+=("\${words[j]%%=*}=\${(Q)words[j]#*=}") ;;
      (-*) ;;
      (*)
        if [[ -z $command ]]; then
          command=$words[j]
          case $command in (${passthroughs.join("|")}) return ;; esac
        fi ;;
    esac
    (( j += 1 ))
  done
}

_nipa_dynamic() {
  local -a values
  values=(\${(f)"$(nipa "\${(@)nipa_scope}" __complete $1 2>/dev/null)"})
  values=("\${(@)values//:/\\\\:}")
  _describe -t $1 $2 values
}

_nipa_openstack() {
  local -a values
  values=(\${(f)"$(nipa "\${(@)nipa_scope}" __complete openstack -- "\${(@)words[2,CURRENT-1]}" "$PREFIX" 2>/dev/null)"})
  if (( $#values )); then compadd -a values; else _files; fi
}

_nipa() {
  local -a nipa_scope
  _nipa_scope
  local i=2 command=""
  while (( i < CURRENT )); do
    case $words[i] in
      ${VALUED_WORDS.join("|")}) (( i += 2 )) ;;
      -*) (( i += 1 )) ;;
      *) command=$words[i]; break ;;
    esac
  done
  if [[ -z $command ]]; then
${zshGlobalValues}
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
  `'(nipa (__nipa_scope) __complete ${kind} 2>/dev/null)'`;

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
    case "resource": {
      return fishDynamic(value.resource);
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
  const passthroughs = programPassthroughs(program);
  const notPassthrough = `not __nipa_using ${passthroughs.join(" ")}`;
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
            case ${VALUED_WORDS.join(" ")}
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

# The profile and project options before the cursor, one word per line.
# commandline -o has already removed the quotes.
function __nipa_scope
    set -l tokens (commandline -opc)
    set -l command
    set -l i 2
    while test $i -le (count $tokens)
        switch $tokens[$i]
            case --
                return
            case ${SCOPE_WORDS.join(" ")}
                if test $i -lt (count $tokens)
                    printf '%s\\n' $tokens[$i] $tokens[(math $i + 1)]
                end
                set i (math $i + 2)
                continue
            case ${SCOPE_JOINED.map((word) => `'${word}'`).join(" ")}
                printf '%s\\n' $tokens[$i]
            case '-*'
                # Another option: nothing to keep.
            case '*'
                if not set -q command[1]
                    set command $tokens[$i]
                    contains -- $command ${passthroughs.join(" ")}; and return
                end
        end
        set i (math $i + 1)
    end
end

function __nipa_openstack
    set -l i (__nipa_command_index); or return
    set -l tokens (commandline -opc)
    set -l values (nipa (__nipa_scope) __complete openstack -- $tokens[(math $i + 1)..-1] (commandline -ct) 2>/dev/null)
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
    case "resource": {
      return `(Dynamic ${value.resource})`;
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
        return `${pad}    { $_ -cin ${pwshList(namesOf(sub))} } {\n${pad}      $c += 1\n${body}\n${pad}    }`;
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
          `if ($prev -cin ${pwshList(flagWords(flag))}) { return Complete ${values} }`,
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
  const passthroughs = programPassthroughs(program);
  const commands = shown
    .map((c) => `    ${pwshQuote(c.name)} = ${pwshQuote(c.summary)}`)
    .join("\n");
  const pwshGlobalValues = VALUED_GLOBALS.flatMap((flag) => {
    const offer = globalValues(flag);
    return offer
      ? [
          `    if ($prev -cin ${pwshList(flagWords(flag))}) { return Complete (Dynamic ${offer.kind}) }`,
        ]
      : [];
  }).join("\n");
  const arms = shown
    .map(
      (spec) =>
        `    { $_ -cin ${pwshList(namesOf(spec))} } {\n${pwshBody(spec, "    ")}\n    }`
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
  function Dynamic([string]$kind) { @(nipa @scope __complete $kind 2>$null) }
  function Openstack([int]$start) {
    $typed = @($words | Select-Object -Skip $start -First ($index - $start))
    @(nipa @scope __complete openstack -- @typed $wordToComplete 2>$null)
  }
  # The profile and project options before the cursor. A quoted value is
  # passed on without its quotes.
  function Scope {
    $command = $null
    for ($j = 1; $j -lt $index; $j++) {
      $word = $words[$j]
      if ($word -ceq '--') { return }
      if ($word -cin ${pwshList(SCOPE_WORDS)}) {
        if ($j + 1 -lt $index) {
          $word
          $value = $commandAst.CommandElements[$j + 1]
          if ($value -is [System.Management.Automation.Language.StringConstantExpressionAst]) { $value.Value } else { $value.ToString() }
        }
        $j += 1
      }
      elseif (${SCOPE_JOINED.map((word) => `$word -clike ${pwshQuote(word)}`).join(" -or ")}) { $word }
      elseif ($word -notlike '-*' -and -not $command) {
        $command = $word
        if ($command -cin ${pwshList(passthroughs)}) { return }
      }
    }
  }
  $words = @($commandAst.CommandElements | ForEach-Object { $_.ToString() })
  # The word being completed is either the last element or a new, empty one.
  $index = if ($wordToComplete) { $words.Count - 1 } else { $words.Count }
  $prev = if ($index -ge 1) { $words[$index - 1] } else { '' }
  $scope = @(Scope)
  $c = 1
  $command = $null
  while ($c -lt $index) {
    if ($words[$c] -cin ${pwshList(VALUED_WORDS)}) { $c += 2 }
    elseif ($words[$c] -like '-*') { $c += 1 }
    else { $command = $words[$c]; break }
  }
  if (-not $command) {
${pwshGlobalValues}
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
