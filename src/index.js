import fs from "node:fs";
import path from "node:path";
import inquirer from "inquirer";
import { spawnSync } from "node:child_process";
import { templates, getTemplateByValue } from "./templates.js";

/**
 * 解析命令行参数并转换成内部配置对象。
 * 这样做的原因：后续流程只依赖一个 args 对象，避免在 run() 里到处判断 argv 细节。
 *
 * @param {string[]} argv Node 原始 argv
 * @returns {{
 *   command: string,
 *   projectName: string,
 *   template: string,
 *   list: boolean,
 *   help: boolean,
 *   force: boolean,
 *   install: boolean,
 *   retries: number
 * }}
 */
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

/**
 * 输出帮助信息。
 * 集中维护命令文档，避免散落在业务逻辑中导致不一致。
 *
 * @returns {void}
 */
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

/**
 * 输出模板列表。
 * 作为 --list 的只读能力，便于用户快速查看可选模板与仓库地址。
 *
 * @returns {void}
 */
function printTemplates() {
  console.log("\n可用模板:");
  templates.forEach((item) => {
    console.log(`- ${item.value}: ${item.name} (${item.repo})`);
  });
  console.log("");
}

/**
 * 简单 sleep 工具：在重试前稍作等待，避免瞬时网络抖动导致连续失败。
 *
 * @param {number} ms 等待毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 执行一次 git clone。
 * 使用 spawnSync + stdio: inherit 的原因：让用户直接看到 git 原始输出，排查问题最直观。
 *
 * @param {string} repo 模板仓库地址
 * @param {string} targetDir 目标目录绝对路径
 * @returns {void}
 * @throws {Error} clone 失败时抛出
 */
function runGitCloneOnce(repo, targetDir) {
  const command = process.platform === "win32" ? "git.exe" : "git";
  const result = spawnSync(command, ["clone", repo, targetDir], {
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error("git clone 失败，请确认你有仓库访问权限且本机已安装 Git。");
  }
}

/**
 * 带重试的 git clone 包装。
 * 原理：失败后删除半拉取目录，避免下一次重试受到脏目录影响。
 *
 * @param {string} repo 模板仓库地址
 * @param {string} targetDir 目标目录绝对路径
 * @param {number} retries 失败重试次数
 * @returns {Promise<void>}
 * @throws {Error} 所有重试都失败时抛出最后一次错误
 */
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

/**
 * 删除模板仓库中的 .git 目录。
 * 为什么这样做：新项目应当是用户自己的仓库起点，而不是继承模板提交历史。
 *
 * @param {string} targetDir 目标目录绝对路径
 * @returns {void}
 */
function removeGitHistory(targetDir) {
  const gitDir = path.join(targetDir, ".git");
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true });
  }
}

/**
 * 在目标目录执行 npm install。
 * 使用同步执行的原因：命令行工具场景下，按步骤串行更可控，输出顺序也更清晰。
 *
 * @param {string} targetDir 目标目录绝对路径
 * @returns {void}
 * @throws {Error} 安装失败时抛出
 */
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

/**
 * 解析项目名：优先用命令参数，缺省时进入交互输入。
 * 这样兼顾了脚本化调用和人工交互两种使用方式。
 *
 * @param {string} currentName 命令行传入的项目名
 * @returns {Promise<string>}
 */
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

/**
 * 解析模板：优先使用 --template，否则给出交互列表。
 * 先校验模板合法性，避免后面 clone 阶段才发现参数错误。
 *
 * @param {string} currentTemplate 命令行传入的模板值
 * @returns {Promise<{name: string, value: string, repo: string, description: string}>}
 */
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

/**
 * 确保目标目录可写入。
 * 设计思路：默认安全（询问确认），需要自动化时可用 --force 跳过交互。
 *
 * @param {string} targetDir 目标目录绝对路径
 * @param {string} projectName 项目目录名（用于提示）
 * @param {boolean} force 是否强制覆盖
 * @returns {Promise<void>}
 * @throws {Error} 用户取消覆盖时抛出
 */
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

/**
 * CLI 主流程入口：
 * 参数处理 -> 输入解析 -> 目录准备 -> 拉取模板 -> 后置安装 -> 完成提示。
 * 将流程串起来写在一个函数中，便于阅读和维护整体执行顺序。
 *
 * @param {string[]} argv Node 原始 argv
 * @returns {Promise<void>}
 */
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
