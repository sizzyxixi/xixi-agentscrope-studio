# AgentScope 官方 Service Web UI

来源：agentscope-ai/agentscope `v2.0.11` 的 `examples/web_ui/frontend`。具体提交、来源与接入修改见 `UPSTREAM.json`；保留 Apache-2.0 LICENSE。

这里保留官方页面与 schema 表单。宿主接入修改为路径前缀 `/agentscope-admin/`、既有账号 Bearer 登录、同源 API 代理、上传请求认证，以及后台保存后通知用户市场刷新。

在项目根目录执行 `npm run service:ui:build`。脚本按本目录 package-lock 安装独立依赖，构建资源到根目录 public/agentscope-admin，并生成 lib/agentscope-admin-shell.ts，供 Workers/Next.js 以同一入口处理深链接。

升级时从新的正式标签重新对比本目录源码，再应用上述宿主接入修改；不要直接复制开发分支或仅替换生成后的资源文件。
