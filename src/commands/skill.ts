import type { Command } from "commander";
import { resolve, dirname, join } from "path";
import { readFile, mkdir, writeFile, access } from "fs/promises";
import { homedir } from "os";

export function registerSkillCommand(program: Command) {
  const skill = program.command("skill").description("manage mcpcli skills");

  skill
    .command("install")
    .description("install the mcpcli skill for an AI agent")
    .requiredOption("--claude", "install for Claude Code")
    .option("--global", "install to ~/.claude/skills/")
    .option("--project", "install to ./.claude/skills/ (default)")
    .option("-f, --force", "overwrite if file already exists")
    .action(
      async (options: {
        claude?: boolean;
        global?: boolean;
        project?: boolean;
        force?: boolean;
      }) => {
        // Resolve the bundled skill file
        const skillSource = resolve(dirname(Bun.main), "..", ".claude", "skills", "mcpcli.md");

        let content: string;
        try {
          content = await readFile(skillSource, "utf-8");
        } catch {
          console.error(`Could not read skill file: ${skillSource}`);
          process.exit(1);
        }

        // Determine targets — default to project if neither flag is set
        const targets: { label: string; dir: string }[] = [];

        if (options.global) {
          targets.push({
            label: "global",
            dir: join(homedir(), ".claude", "skills"),
          });
        }
        if (options.project || !options.global) {
          targets.push({
            label: "project",
            dir: resolve(".claude", "skills"),
          });
        }

        for (const target of targets) {
          const dest = join(target.dir, "mcpcli.md");

          // Check if file already exists
          if (!options.force) {
            try {
              await access(dest);
              console.error(`${dest} already exists (use --force to overwrite)`);
              process.exit(1);
            } catch {
              // File doesn't exist — good
            }
          }

          await mkdir(target.dir, { recursive: true });
          await writeFile(dest, content, "utf-8");
          console.log(`Installed mcpcli skill (${target.label}): ${dest}`);
        }
      },
    );
}
