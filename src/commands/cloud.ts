import { ApiError, createService } from "../lib/api";
import type { Service } from "../lib/api";
import { KeystoneError, listEndpoints } from "../lib/keystone";
import type { Endpoints } from "../lib/keystone";
import { saveSession } from "../lib/store";
import type { Session } from "../lib/store";
import { CliError } from "../lib/ui";
import { announceProfile, loginCommand, requireSession } from "./login";
import type { ActiveProfile, Globals } from "./login";

export interface Cloud {
  active: ActiveProfile;
  session: Session;
  /** Throws when the catalog has no endpoint of this type in the region. */
  service: (type: string) => Promise<Service>;
}

/** A 401 means Keystone revoked the token before it expired. */
const guardSession =
  (profile: string) =>
  async <T>(task: () => Promise<T>): Promise<T> => {
    try {
      return await task();
    } catch (error) {
      const status =
        error instanceof ApiError || error instanceof KeystoneError
          ? error.status
          : undefined;
      if (status === 401) {
        throw new CliError(`your ${profile} session expired or was revoked`, {
          hint: `Run \`${loginCommand(profile)}\`.`,
        });
      }
      throw error;
    }
  };

export const requireCloud = async (globals: Globals): Promise<Cloud> => {
  const { active, session } = await requireSession(globals);
  announceProfile(active);
  const { authUrl, region } = active.profile;
  const guard = guardSession(active.name);
  let { endpoints } = session;

  // nipa reads the catalog on first use, so login and switch don't wait for
  // it, and saves it with the session, which a switch replaces.
  const loadEndpoints = async (): Promise<Endpoints> => {
    if (!endpoints) {
      endpoints = await guard(() =>
        listEndpoints({ authUrl, region, token: session.token })
      );
      await saveSession({
        profile: active.name,
        session: { ...session, endpoints },
      });
    }
    return endpoints;
  };

  return {
    active,
    service: async (type) => {
      const loaded = await loadEndpoints();
      const url = loaded[type];
      if (!url) {
        throw new CliError(`there's no ${type} endpoint in ${region}`, {
          hint: "Check the profile's region with `nipa profile ls`.",
        });
      }
      const service = createService({ token: session.token, type, url });
      return {
        get: (path, schema, headers) =>
          guard(() => service.get(path, schema, headers)),
      };
    },
    session,
  };
};
