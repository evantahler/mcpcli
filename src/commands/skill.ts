import type { Command } from "commander";
import { resolve, dirname, join } from "path";
import { readFile, mkdir, writeFile, access } from "fs/promises";
import { homedir } from "os";

interface SkillTarget {
  label: string;
  dir: string;
  filename: string;
}

export function registerSkillCommand(program: Command) {
  const skill = program.command("skill").description("manage mcpcli skills");

  skill
    .command("install")
    .description("install the mcpcli skill for an AI agent")
    .option("--claude", "install for Claude Code")
    .option("--cursor", "install for Cursor")
    .option("--global", "install to global location (e.g. ~/.claude/skills/)")
    .option("--project", "install to project location (default)")
    .option("-f, --force", "overwrite if file already exists")
    .action(
      async (options: {
        claude?: boolean;
        cursor?: boolean;
        global?: boolean;
        project?: boolean;
        force?: boolean;
      }) => {
        if (!options.claude && !options.cursor) {
          console.error("error: specify at least one agent target: --claude, --cursor");
          process.exit(1);
        }

        const agents: {
          name: string;
          sourcePath: string;
          globalDir: string;
          projectDir: string;
          filename: string;
        }[] = [];

        if (options.claude) {
          agents.push({
            name: "Claude Code",
            sourcePath: resolve(dirname(Bun.main), "..", ".claude", "skills", "mcpcli.md"),
            globalDir: join(homedir(), ".claude", "skills"),
            projectDir: resolve(".claude", "skills"),
            filename: "mcpcli.md",
          });
        }

        if (options.cursor) {
          agents.push({
            name: "Cursor",
            sourcePath: resolve(dirname(Bun.main), "..", ".cursor", "rules", "mcpcli.mdc"),
            globalDir: join(homedir(), ".cursor", "rules"),
            projectDir: resolve(".cursor", "rules"),
            filename: "mcpcli.mdc",
          });
        }

        for (const agent of agents) {
          let content: string;
          try {
            content = await readFile(agent.sourcePath, "utf-8");
          } catch {
            console.error(`Could not read skill file: ${agent.sourcePath}`);
            process.exit(1);
          }

          // Determine targets — default to project if neither flag is set
          const targets: SkillTarget[] = [];

          if (options.global) {
            targets.push({
              label: "global",
              dir: agent.globalDir,
              filename: agent.filename,
            });
          }
          if (options.project || !options.global) {
            targets.push({
              label: "project",
              dir: agent.projectDir,
              filename: agent.filename,
            });
          }

          for (const target of targets) {
            const dest = join(target.dir, target.filename);

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
            console.log(`Installed mcpcli skill for ${agent.name} (${target.label}): ${dest}`);
          }
        }
      },
    );
}
