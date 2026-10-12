"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { COMMAND_GROUPS } from "@/lib/commands";
import { active, text, typed } from "@/lib/terminal";
import type { Cell } from "@/lib/terminal";

import { InspectOutput, WhoamiOutput } from "./sessions";
import {
  Answer,
  Bold,
  Command,
  Cyan,
  Dim,
  Line,
  Log,
  Table,
  Terminal,
} from "./terminal";

type Project = "my-project" | "billing";

interface Session {
  loggedIn: boolean;
  project: Project;
}

interface Result {
  output: ReactNode;

  session?: Session;
}

const SERVER_HEADINGS = ["Name", "Status", "Address", "Flavor", "Age"];

const LARGE = "csa.large.v2";

const SERVERS: Record<Project, Cell[][]> = {
  billing: [
    [
      text("invoices-1"),
      active,
      text("203.0.113.31"),
      text(LARGE),
      text("21d"),
    ],
  ],
  "my-project": [
    [
      text("web-2"),
      { dot: "amber", text: "● Build" },
      text("192.0.2.7"),
      text(LARGE),
      text("2m"),
    ],
    [text("web-1"), active, text("203.0.113.10"), text(LARGE), text("3d")],
    [
      text("db-1"),
      { dot: "gray", text: "● Shutoff" },
      text("198.51.100.4"),
      text("csa.xlarge.v2"),
      text("40d"),
    ],
  ],
};

const isProject = (name: string): name is Project =>
  Object.hasOwn(SERVERS, name);

const DEMO_COMMANDS = [
  ["nipa whoami", "Show who you're logged in as"],
  ["nipa server ls", "List the servers in your project"],
  ["nipa lb inspect web-lb", "Show why a load balancer doesn't serve"],
  ["nipa switch billing", "Use another project"],
  ["nipa logout", "Revoke the token and forget the session"],
  ["nipa login", "Log in with your password and an OTP code"],
  ["nipa tf plan", "Run terraform with the session"],
  ["clear", "Clear the screen"],
] as const;

const SUGGESTED = DEMO_COMMANDS.slice(0, 5).map(([command]) => command);
const HELP_WIDTH = Math.max(
  ...DEMO_COMMANDS.map(([command]) => command.length)
);

const COMMAND_NAMES: readonly string[] = COMMAND_GROUPS.flatMap((group) =>
  group.commands.map(([name]) => name)
);

const Success = ({ children }: { children: ReactNode }) => (
  <Line>
    <Cyan>&gt; Success!</Cyan> {children}
  </Line>
);

const Aside = ({ children }: { children: ReactNode }) => (
  <Line>
    <Dim># {children}</Dim>
  </Line>
);

const Failure = ({ hint, message }: { hint: string; message: string }) => (
  <>
    <Line>
      <span className="font-semibold text-red-900">Error:</span> {message}
    </Line>
    <Log>{hint}</Log>
  </>
);

const Help = () => (
  <>
    <Aside>The demo runs these commands, with made-up data:</Aside>
    <Line />
    {DEMO_COMMANDS.map(([command, description]) => (
      <Line key={command}>
        {"  "}
        <Bold>{command.padEnd(HELP_WIDTH)}</Bold>
        {"     "}
        <Dim>{description}</Dim>
      </Line>
    ))}
    <Line />
  </>
);

const tryHelp = (command: string): Result => ({
  output: (
    <Aside>
      The demo doesn&apos;t run `{command}`. Type `help` to see what it runs.
    </Aside>
  ),
});

type Handler = (input: {
  args: string;
  command: string;
  session: Session;
}) => Result;

const HANDLERS = {
  lb: ({ args, command, session }) =>
    args === "inspect web-lb"
      ? { output: <InspectOutput project={session.project} /> }
      : tryHelp(command),
  logout: ({ session }) =>
    session.loggedIn
      ? {
          output: (
            <Success>
              Logged out of <Bold>prod</Bold>
            </Success>
          ),
          session: { ...session, loggedIn: false },
        }
      : {
          output: (
            <Line>
              <span className="font-semibold text-amber-900">&gt; NOTE:</span>{" "}
              Not logged in to prod, so `nipa logout` did nothing
            </Line>
          ),
        },
  server: ({ args, command, session }) =>
    args === "" || args === "ls"
      ? {
          output: (
            <>
              <Log>
                Servers in <Bold>{session.project}</Bold> <Dim>[312ms]</Dim>
              </Log>
              <Table
                headings={SERVER_HEADINGS}
                rows={SERVERS[session.project]}
              />
            </>
          ),
        }
      : tryHelp(command),
  switch: ({ args, session }) =>
    isProject(args)
      ? {
          output: (
            <Success>
              Switched to <Bold>{args}</Bold> <Dim>[184ms]</Dim>
            </Success>
          ),
          session: { ...session, project: args },
        }
      : {
          output: (
            <Aside>
              The demo has two projects. Try `nipa switch billing` or `nipa
              switch my-project`.
            </Aside>
          ),
        },
  tf: ({ args, command }) =>
    args === "plan"
      ? {
          output: (
            <>
              <Line />
              <Line>
                <Bold>Plan:</Bold> 2 to add, 0 to change, 0 to destroy.
              </Line>
              <Line />
            </>
          ),
        }
      : tryHelp(command),
  whoami: ({ session }) => ({
    output: <WhoamiOutput project={session.project} />,
  }),
} satisfies Record<string, Handler>;

const isHandled = (name: string): name is keyof typeof HANDLERS =>
  Object.hasOwn(HANDLERS, name);

const editDistance = (from: string, to: string): number => {
  let row = Array.from({ length: to.length + 1 }, (_, index) => index);
  for (const [i, a] of [...from].entries()) {
    const next = [i + 1];
    for (const [j, b] of [...to].entries()) {
      next.push(
        Math.min(
          (row[j + 1] ?? 0) + 1,
          (next[j] ?? 0) + 1,
          (row[j] ?? 0) + (a === b ? 0 : 1)
        )
      );
    }
    row = next;
  }
  return row.at(-1) ?? 0;
};

const unknownCommand = (word: string): Result => {
  const [closest] = COMMAND_NAMES.map((name) => ({
    name,
    score: editDistance(word, name),
  })).toSorted((a, b) => a.score - b.score);
  return {
    output: (
      <Failure
        hint={
          closest && closest.score <= 2
            ? `Did you mean \`nipa ${closest.name}\`?`
            : "Run `nipa --help` to see the commands."
        }
        message={`unknown command "${word}"`}
      />
    ),
  };
};

const HELP_WORDS = new Set(["--help", "-h", "help"]);

const startsLogin = (words: readonly string[], session: Session): boolean => {
  const [program, name] = words;
  if (program !== "nipa" || name === undefined) {
    return false;
  }
  return (
    name === "login" ||
    (!session.loggedIn && isHandled(name) && name !== "logout")
  );
};

const run = (words: readonly string[], session: Session): Result => {
  const [program = "", name, ...rest] = words;
  if (program === "help") {
    return { output: <Help /> };
  }
  if (program !== "nipa") {
    return { output: <Line>zsh: command not found: {program}</Line> };
  }
  if (name === undefined || HELP_WORDS.has(name)) {
    return { output: <Help /> };
  }
  const command = words.join(" ");
  if (isHandled(name)) {
    return HANDLERS[name]({ args: rest.join(" "), command, session });
  }
  return COMMAND_NAMES.includes(name) ? tryHelp(command) : unknownCommand(name);
};

interface Block {
  id: number;
  node: ReactNode;
}

const OTP = /^\d{6}$/u;

const LOGIN = "nipa login";
const SERVER_LS = "nipa server ls";

const LOGIN_AT = 600;
const LOGIN_DONE = LOGIN_AT + typed(LOGIN);
const SERVER_LS_AT = LOGIN_DONE + 3400;
const SERVER_LS_DONE = SERVER_LS_AT + typed(SERVER_LS);
const PROMPT_AT = SERVER_LS_DONE + 700;

const Played = () => (
  <>
    <Command at={LOGIN_AT}>{LOGIN}</Command>
    <Log at={LOGIN_DONE + 200}>
      Logging in to <Bold>prod</Bold> <Dim>(identity-api.nipa.cloud)</Dim>
    </Log>
    <Answer at={LOGIN_DONE + 700} label="Email">
      me@example.com
    </Answer>
    <Answer at={LOGIN_DONE + 1100} label="Project ID">
      1234567890abcdef1234567890abcdef
    </Answer>
    <Answer at={LOGIN_DONE + 1500} label="Password">
      ********
    </Answer>
    <Answer at={LOGIN_DONE + 2100} label="OTP code">
      123456
    </Answer>
    <Line at={LOGIN_DONE + 2700}>
      <Cyan>&gt; Success!</Cyan> Logged in as me@example.com, project my-project
    </Line>
    <Command at={SERVER_LS_AT}>{SERVER_LS}</Command>
    <Log at={SERVER_LS_DONE + 300}>
      Servers in <Bold>my-project</Bold> <Dim>[312ms]</Dim>
    </Log>
    <Table
      at={SERVER_LS_DONE + 300}
      headings={SERVER_HEADINGS}
      rows={SERVERS["my-project"]}
    />
  </>
);

export const HeroSession = ({ className }: { className?: string }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [cleared, setCleared] = useState(false);
  const [started, setStarted] = useState(false);
  const [value, setValue] = useState("");

  const [waiting, setWaiting] = useState<readonly string[] | true | null>(null);

  const [rejected, setRejected] = useState(false);

  const session = useRef<Session>({ loggedIn: true, project: "my-project" });
  const history = useRef<string[]>([]);

  const recalled = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const toBottom = () => {
    const body = input.current?.closest("pre");
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  };
  useLayoutEffect(toBottom, [blocks, waiting, rejected]);

  const print = (...nodes: ReactNode[]) => {
    setBlocks((current) => {
      const first = (current.at(-1)?.id ?? 0) + 1;
      return [
        ...current,
        ...nodes.map((node, index) => ({ id: first + index, node })),
      ];
    });
  };

  const submit = (raw: string) => {
    const command = raw.trim().replaceAll(/\s+/gu, " ");
    setValue("");
    recalled.current = null;
    if (command === "") {
      return;
    }
    history.current.push(command);
    if (command === "clear") {
      setBlocks([]);
      setCleared(true);
      return;
    }
    const words = command.split(" ");
    const echo = <Command>{command}</Command>;
    if (startsLogin(words, session.current)) {
      print(
        echo,
        <Log>
          Logging in to <Bold>prod</Bold> <Dim>(identity-api.nipa.cloud)</Dim>
        </Log>,
        <Answer label="Email">me@example.com</Answer>,
        <Answer label="Project ID">1234567890abcdef1234567890abcdef</Answer>,
        <Answer label="Password">********</Answer>
      );
      setWaiting(words[1] === "login" ? true : words);

      input.current?.focus();
      return;
    }
    const result = run(words, session.current);
    print(echo, result.output);
    session.current = result.session ?? session.current;
  };

  const submitCode = (code: string) => {
    if (waiting === null) {
      return;
    }
    if (!OTP.test(code)) {
      setRejected(true);
      return;
    }
    const loggedIn = { ...session.current, loggedIn: true };
    const result = waiting === true ? undefined : run(waiting, loggedIn);
    print(
      <Answer label="OTP code">{code}</Answer>,
      <Success>
        Logged in as me@example.com, project {loggedIn.project}
      </Success>,
      result?.output
    );
    session.current = result?.session ?? loggedIn;
    setWaiting(null);
    setValue("");
  };

  const recall = (step: number) => {
    const commands = history.current;
    const from = recalled.current ?? commands.length;
    const index = Math.min(Math.max(from + step, 0), commands.length);
    recalled.current = index === commands.length ? null : index;
    setValue(commands[index] ?? "");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (waiting === null) {
        submit(value);
      } else {
        submitCode(value);
      }
      return;
    }
    if (waiting !== null) {
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      recall(event.key === "ArrowUp" ? -1 : 1);
    }
  };

  return (
    <Terminal
      className={`has-[input:focus-visible]:ring-gray-alpha-700 has-[input:focus-visible]:ring-2 ${className ?? ""}`}
      footer={
        <div className="border-gray-alpha-400 flex items-center gap-2 overflow-x-auto border-t px-4 py-3">
          <span className="font-mono text-xs text-gray-900">Try</span>
          {SUGGESTED.map((command) => (
            <button
              className="border-gray-alpha-400 bg-gray-alpha-100 hover:bg-gray-alpha-200 h-8 shrink-0 rounded-lg border px-2.5 font-mono text-xs whitespace-nowrap transition-colors duration-150 disabled:opacity-50"
              disabled={waiting !== null}
              key={command}
              onClick={() => {
                setStarted(true);
                submit(command);
              }}
              type="button"
            >
              {command}
            </button>
          ))}
          <span className="ml-auto shrink-0 pl-4 text-xs text-gray-900 max-lg:hidden">
            Made-up data
          </span>
        </div>
      }
      glass
      label="A terminal you can type in. It plays nipa login, which asks for a password and an OTP code once, then nipa server ls, which lists three servers without asking again. After that it runs the commands you type, with made-up data."
      scroll
      title="nipa"
    >
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- the label already moves a click to the prompt, and the handler only cancels that move */}
      <label
        className="block min-h-full cursor-text"
        data-played={started || undefined}
        onClick={(event) => {
          if (window.getSelection()?.isCollapsed === false) {
            event.preventDefault();
          }
        }}
      >
        {cleared ? null : <Played />}
        <span className="block" role="log">
          {blocks.map((block) => (
            <span className="contents" key={block.id}>
              {block.node}
            </span>
          ))}
        </span>
        <Line at={started ? undefined : PROMPT_AT}>
          <span className="flex">
            {waiting === null ? (
              <Dim>$ </Dim>
            ) : (
              <span>
                <Cyan>?</Cyan> <Bold>OTP code</Bold>{" "}
              </span>
            )}
            <input
              aria-invalid={rejected || undefined}
              aria-label={
                waiting === null
                  ? "Type a nipa command"
                  : "OTP code, any 6 digits"
              }
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className="caret-gray-1000 min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-800 max-sm:text-base"
              enterKeyHint={waiting === null ? "go" : "done"}
              inputMode={waiting === null ? "text" : "numeric"}
              maxLength={waiting === null ? 80 : 6}
              onChange={(event) => {
                setValue(event.target.value);
                setRejected(false);
                toBottom();
              }}
              onFocus={() => {
                setStarted(true);
              }}
              onKeyDown={onKeyDown}
              ref={input}
              placeholder={
                waiting === null
                  ? "Type a command, or help"
                  : "Any 6 digits. This is a demo."
              }
              spellCheck={false}
              value={value}
            />
          </span>
        </Line>
        {rejected ? (
          <Line>
            <span role="alert">
              <Dim># An OTP code has 6 digits. The demo takes any 6.</Dim>
            </span>
          </Line>
        ) : null}
      </label>
    </Terminal>
  );
};
