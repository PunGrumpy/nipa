import { active, text } from "@/lib/terminal";
import type { Cell } from "@/lib/terminal";

import {
  Bold,
  Command,
  Dim,
  Fields,
  Line,
  Log,
  Table,
  Terminal,
} from "./terminal";

/** What `nipa whoami` prints for a project. */
export const WhoamiOutput = ({ project }: { project: string }) => (
  <>
    <Log>
      Logged in as <Bold>me@example.com</Bold>
    </Log>
    <Log>
      Profile: <Bold>prod</Bold> <Dim>(identity-api.nipa.cloud, NCP-TH)</Dim>
    </Log>
    <Log>
      Project: <Bold>{project}</Bold>{" "}
      <Dim>(1234567890abcdef1234567890abcdef)</Dim>
    </Log>
    <Log>The session expires in 23h 41m</Log>
  </>
);

export const WhoamiSession = () => (
  <Terminal
    label="nipa whoami shows the user, the profile, the project and that the session expires in 23 hours."
    title="nipa whoami"
  >
    <Command>nipa whoami</Command>
    <WhoamiOutput project="my-project" />
    <Line />
    <Command>nipa switch billing</Command>
    <Line>
      <span className="text-teal-900">&gt; Success!</span> Switched to{" "}
      <Bold>billing</Bold> <Dim>[184ms]</Dim>
    </Line>
  </Terminal>
);

export const ToolsSession = () => (
  <Terminal
    label="nipa runs terraform plan against the staging profile and passes the session to another command through OS_ variables."
    title="nipa tf plan"
  >
    <Command>nipa -P staging tf plan</Command>
    <Log>
      Using profile <Bold>staging</Bold> <Dim>(keystone.example.com)</Dim>
    </Log>
    <Line />
    <Line>
      <Bold>Plan:</Bold> 2 to add, 0 to change, 0 to destroy.
    </Line>
    <Line />
    <Command>nipa exec env | grep OS_AUTH</Command>
    <Line>OS_AUTH_TYPE=v3token</Line>
    <Line>OS_AUTH_URL=https://identity-api.nipa.cloud/v3</Line>
  </Terminal>
);

const down = (name: string): Cell => ({
  className: "text-red-900",
  text: name,
});
const online: Cell = { dot: "green", text: "● Online" };
const failed: Cell = { dot: "red", text: "● Error" };

const member = (name: Cell, address: string, health: Cell): Cell[] => [
  name,
  text(address),
  text("web"),
  text("1"),
  text("No"),
  active,
  health,
];

/** What `nipa lb inspect web-lb` prints. */
export const InspectOutput = ({ project }: { project: string }) => (
  <>
    <Log>
      Load balancer <Bold>web-lb</Bold> in <Bold>{project}</Bold>{" "}
      <Dim>[428ms]</Dim>
    </Log>
    <Fields
      fields={[
        ["ID", text("0b6f3c1e-8a52-4d7e-9c41-5e2a7f90d3b8")],
        ["Status", active],
        ["Health", { dot: "red", text: "● Degraded" }],
        ["Address", text("192.0.2.12")],
        ["External IP", text("203.0.113.20")],
        ["Created", { className: "text-gray-900", text: "12d ago" }],
      ]}
    />
    <Log>3 members</Log>
    <Table
      headings={[
        "Member",
        "Address",
        "Backend group",
        "Weight",
        "Backup",
        "Status",
        "Health",
      ]}
      rows={[
        member(text("web-1"), "192.0.2.21:80", online),
        member(down("web-2"), "192.0.2.22:80", failed),
        member(down("web-3"), "192.0.2.23:80", failed),
      ]}
    />
    <Line>
      <span className="font-semibold text-amber-900">&gt; NOTE:</span> 2 of 3
      members are down.
    </Line>
  </>
);

export const InspectSession = () => (
  <Terminal
    dense
    label="nipa lb inspect shows a load balancer with three members and says that 2 of 3 members are down."
    title="nipa lb inspect"
  >
    <Command>nipa lb inspect web-lb</Command>
    <InspectOutput project="my-project" />
  </Terminal>
);
