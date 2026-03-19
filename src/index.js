import fs from "node:fs";
import path from "node:path";
import inquirer from "inquirer";
import { spawnSync } from "node:child_process";
import { templates, getTemplateByValue } from "./templates.js";

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    command: "create",
    projectName: "",
    template: "",
    list: false,
    help: false,
    force: false,
    install: false,
    retries: 2
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "create" || arg === "init") {
      result.command = "create";
      continue;
    }

    if (arg === "--list" || arg === "-l") {
      result.list = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (arg === "--force" || arg === "-f") {
      result.force = true;
      continue;
    }

    if (arg === "--install" || arg === "-i") {
      result.install = true;
      continue;
    }

    if (arg === "--retries") {
      const raw = args[i + 1];
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n)) result.retries = Math.max(0, n);
      i += 1;
      continue;
    }

    if (arg === "--template" || arg === "-t") {
      result.template = args[i + 1] || "";
      i += 1;
      continue;
    }

    if (!arg.startsWith("-") && !result.projectName) {
      result.projectName = arg;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
vrcli - 多模板脚手架

用法:
  vrcli create [project-name] [--template vue|react] [--force] [--install] [--retries 2]
  vrcli init [project-name] [--template vue|react] [--force] [--install] [--retries 2]
  vrcli --list

参数:
  -t, --template   指定模板 (vue/react)
  -l, --list       显示可用模板
  -f, --force      目标目录存在时强制覆盖
  -i, --install    创建后自动执行 npm install
      --retries    git clone 失败重试次数 (默认 2)
  -h, --help       显示帮助
`);
}

function printTemplates() {
  console.log("\n可用模板:");
  templates.forEach((item) => {
    console.log(`- ${item.value}: ${item.name} (${item.repo})`);
  });
  console.log("");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runGitCloneOnce(repo, targetDir) {
  const command = process.platform === "win32" ? "git.exe" : "git";
  const result = spawnSync(command, ["clone", repo, targetDir], {
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error("git clone 失败，请确认你有仓库访问权限且本机已安装 Git。");
  }
}

async function runGitCloneWithRetries(repo, targetDir, retries) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 0) {
        console.log(`\n正在重试 git clone... (${attempt}/${retries})`);
      }
      runGitCloneOnce(repo, targetDir);
      return;
    } catch (error) {
      lastError = error;
      try {
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
      } catch {
        // ignore cleanup error
      }
      if (attempt < retries) {
        await sleep(800 * attempt + 400);
      }
    }
  }
  throw lastError;
}

function removeGitHistory(targetDir) {
  const gitDir = path.join(targetDir, ".git");
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true });
  }
}

function runNpmInstall(targetDir) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["install"], {
    cwd: targetDir,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error("npm install 失败，请进入目录后手动安装依赖。");
  }
}

async function resolveProjectName(currentName) {
  if (currentName) return currentName.trim();

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "projectName",
      message: "请输入项目目录名称:",
      validate(input) {
        if (!input || !input.trim()) return "项目名不能为空";
        return true;
      }
    }
  ]);

  return answers.projectName.trim();
}

async function resolveTemplate(currentTemplate) {
  if (currentTemplate) {
    const found = getTemplateByValue(currentTemplate);
    if (!found) {
      throw new Error(`模板 "${currentTemplate}" 不存在，可用值为: vue, react`);
    }
    return found;
  }

  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "template",
      message: "请选择你要使用的模板:",
      choices: templates.map((item) => ({
        name: `${item.name} - ${item.description}`,
        value: item.value
      }))
    }
  ]);

  return getTemplateByValue(answers.template);
}

async function ensureTargetDirEmpty(targetDir, projectName, force) {
  if (!fs.existsSync(targetDir)) return;

  if (force) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "overwrite",
      message: `目录 "${projectName}" 已存在，是否覆盖？`,
      default: false
    }
  ]);

  if (!answers.overwrite) {
    throw new Error("已取消创建。");
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
}

export async function run(argv) {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    return;
  }

  if (args.list) {
    printTemplates();
    return;
  }

  const projectName = await resolveProjectName(args.projectName);
  const selectedTemplate = await resolveTemplate(args.template);
  const targetDir = path.resolve(process.cwd(), projectName);

  await ensureTargetDirEmpty(targetDir, projectName, args.force);

  console.log(`\n正在拉取模板: ${selectedTemplate.name}`);
  console.log(`仓库地址: ${selectedTemplate.repo}`);
  await runGitCloneWithRetries(selectedTemplate.repo, targetDir, args.retries);
  removeGitHistory(targetDir);

  if (args.install) {
    console.log("\n正在安装依赖 (npm install) ...");
    runNpmInstall(targetDir);
  }

  console.log("\n项目创建成功!");
  console.log(`目录: ${targetDir}`);
  console.log("\n下一步:");
  console.log(`  cd ${projectName}`);
  if (!args.install) console.log("  npm install");
  console.log("  npm run dev");
}
