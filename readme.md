# vrcli

`vrcli` 是一个多模板脚手架：每个模板独立维护在一个仓库中，CLI 只负责模板选择与拉取。

当前内置模板：

- `vue` -> `https://github.com/vipbo/my-cli.git`
- `react` -> `https://github.com/vipbo/my-react-template.git`

## 使用方式

### 0) 直接使用（推荐）

无需安装到全局：

```bash
npx vrcli create my-app --template vue
```

或全局安装：

```bash
npm i -g vrcli
vrcli create my-app --template react
```

### 1) 安装依赖

```bash
npm install
```

### 2) 本地运行

```bash
node ./bin/vrcli.js create
```

或指定项目名 + 模板：

```bash
node ./bin/vrcli.js create my-app --template vue
node ./bin/vrcli.js create my-react-app --template react
```

### 3) 作为命令使用（可选）

在本项目根目录执行：

```bash
npm link
```

然后可直接使用：

```bash
vrcli create demo --template vue
```

## 命令说明

```bash
vrcli create [project-name] [--template vue|react]
vrcli init [project-name] [--template vue|react]
vrcli --list
vrcli --help
```

参数：

- `-t, --template`：指定模板，支持 `vue` / `react`
- `-l, --list`：查看可用模板
- `-f, --force`：目标目录存在时强制覆盖
- `-i, --install`：创建后自动执行 `npm install`
- `--retries <n>`：`git clone` 失败重试次数（默认 `2`）
- `-h, --help`：查看帮助

## 工作机制

1. 用户执行 `vrcli create`。
2. CLI 让用户选择模板（或使用 `--template` 直接指定）。
3. 通过 `git clone` 拉取对应模板仓库到新目录。
4. 自动移除模板仓库里的 `.git`，避免继承模板历史提交。


## 团队协作建议

- 每个模板独立仓库维护，模板负责人只关心模板内容演进。
- `vrcli` 仓库只维护模板清单与创建逻辑。
- 新增模板时，只需在 `src/templates.js` 增加一条配置。
