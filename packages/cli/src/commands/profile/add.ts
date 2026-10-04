import { handle } from "../../util/command";
import { probe } from "../../util/keystone";
import {
  loadConfig,
  PROD_PROFILE,
  PROFILE_NAME,
  ProfileSchema,
  saveConfig,
} from "../../util/store";
import type { Config, Profile } from "../../util/store";
import { bold, log, success, usageError, withSpinner } from "../../util/ui";
import type { Prompts } from "../../util/ui";
import { addSubcommand } from "./command";

const validateName =
  (config: Config) =>
  (name: string): string | true => {
    if (!PROFILE_NAME.test(name)) {
      return "Use lowercase letters, digits and hyphens, starting with a letter";
    }
    return config.profiles[name]
      ? `A profile named ${name} already exists`
      : true;
  };

const validateUrl = (value: string): string | true =>
  ProfileSchema.shape.authUrl.safeParse(value).success ||
  "Enter an http or https URL, such as https://keystone.example.com/v3";

const valueOrAsk = (input: {
  value: string | undefined;
  flag: string;
  prompts: Prompts;
  ask: () => Promise<string>;
}): Promise<string> => {
  if (input.value !== undefined) {
    return Promise.resolve(input.value);
  }
  if (!input.prompts.interactive) {
    throw usageError(
      `missing ${input.flag}`,
      "Pass every value as a flag when there is no terminal."
    );
  }
  return input.ask();
};

export const add = handle(addSubcommand, async ({ args, client, flags }) => {
  const { prompts } = client;
  const config = await loadConfig();
  const checkName = validateName(config);
  const name = await valueOrAsk({
    ask: () => prompts.text({ message: "Profile name", validate: checkName }),
    flag: "<name>",
    prompts,
    value: args.name,
  });
  const nameProblem = checkName(name);
  if (nameProblem !== true) {
    throw usageError(`can't add profile "${name}"`, nameProblem);
  }
  const authUrl = await valueOrAsk({
    ask: () => prompts.text({ message: "Keystone URL", validate: validateUrl }),
    flag: "--auth-url",
    prompts,
    value: flags["auth-url"],
  });
  const urlProblem = validateUrl(authUrl);
  if (urlProblem !== true) {
    throw usageError(`invalid --auth-url "${authUrl}"`, urlProblem);
  }
  const userDomain =
    flags["user-domain"] ??
    (prompts.interactive
      ? await prompts.text({
          default: PROD_PROFILE.userDomain,
          message: "User domain",
        })
      : PROD_PROFILE.userDomain);
  const region =
    flags.region ??
    (prompts.interactive
      ? await prompts.text({ default: PROD_PROFILE.region, message: "Region" })
      : PROD_PROFILE.region);
  const started = performance.now();
  const version = await withSpinner(`Checking ${authUrl}…`, () =>
    probe(authUrl)
  );
  const profile: Profile = { authUrl, region, userDomain };
  const use =
    flags.use ??
    (prompts.interactive &&
      (await prompts.confirm({ default: true, message: `Use ${name} now?` })));
  await saveConfig({
    currentProfile: use ? name : config.currentProfile,
    profiles: { ...config.profiles, [name]: profile },
  });
  success(
    `Added profile ${bold(name)} (Keystone ${version})`,
    performance.now() - started
  );
  log(
    use
      ? `Now using ${bold(name)}. Run \`nipa login\` to log in to it.`
      : `Run \`nipa login -P ${name}\` to log in to it.`
  );
  return 0;
});
