export const templates = [
  {
    name: "Vue 模板",
    value: "vue",
    repo: "git@github.com:vipbo/my-cli.git",
    description: "团队维护的 Vue 项目模板"
  },
  {
    name: "React 模板",
    value: "react",
    repo: "git@github.com:vipbo/my-react-template.git",
    description: "团队维护的 React 项目模板"
  }
];

export function getTemplateByValue(value) {
  return templates.find((item) => item.value === value);
}
