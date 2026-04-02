// src/git.ts — Git operations via Deno subprocess
// The most important file. Written first.

async function exec(args: string[]): Promise<string> {
  const cmd = new Deno.Command("git", {
    args,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    throw new Error(`git ${args[0]} failed: ${stderr}`);
  }
  return new TextDecoder().decode(result.stdout);
}

export const git = {
  async add(path: string): Promise<void> {
    await exec(["add", path]);
  },

  async commit(message: string): Promise<void> {
    await exec(["commit", "-m", message]);
  },

  async branch(name: string): Promise<void> {
    await exec(["checkout", "-b", name]);
  },

  async checkout(name: string): Promise<void> {
    await exec(["checkout", name]);
  },

  async log(n = 20): Promise<string> {
    return (await exec(["log", "--oneline", `-${n}`])).trim();
  },

  async diff(from: string, to: string, path?: string): Promise<string> {
    const args = ["diff", `${from}..${to}`];
    if (path) args.push("--", path);
    return await exec(args);
  },

  async currentBranch(): Promise<string> {
    return (await exec(["branch", "--show-current"])).trim();
  },

  async branchExists(name: string): Promise<boolean> {
    try {
      await exec(["rev-parse", "--verify", name]);
      return true;
    } catch {
      return false;
    }
  },

  async merge(branch: string): Promise<void> {
    await exec(["merge", branch]);
  },

  async deleteBranch(name: string): Promise<void> {
    await exec(["branch", "-d", name]);
  },
};
