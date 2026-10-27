# KPL Coin 前端

遵循平台 `KQ-KUN/kplgame` 的 `docs/UI_STANDARD.md` 和 `docs/EDITORIAL_IMPLEMENTATION.md` 的暖纸色刊物风格。独立静态项目，不修改KPL GAME生产配置或部署。

独立验收包没有平台目录时，可读`docs/REFERENCE_UI_STANDARD.md`和`REFERENCE_EDITORIAL_IMPLEMENTATION.md`；二者是2026-10-13只读快照，不自动同步平台修改。

唯一金额公式来自本仓库已验收 `runtime/ledger.mjs`。`runtime/ledger.mjs`是逐字节生成的依赖快照，修改源B文件或另写结算公式均禁止。A/B/B.1文件保持原字节。

`data/coin-ui-v1.json`和现有队徽快照由`tools/export_ui_data.py`生成；开发构建只使用本前端内的冻结资源。不得从前端加载审计结构、真实盘口API、原仓库或第三方字体。

- `npm test` 验证纯逻辑与冻结核心；`build` 只按 `config/runtime-files.json` 消费已生成快照；`validate` 检查构建/数据/资源hash；`test:resume` 执行本地浏览器。数据更新独立运行 `data:manifest`，不在build内自动抓取或重算。
- 存档仅记录操作并复用原引擎重放，不能另写金额公式。统计已于2026-10-27获用户批准启用；`ANALYTICS_ENABLED=true` 必须与平台白名单、端点和周报查询同步。统计失败不影响游戏；关闭统计需明确授权，不得在恢复存档或重绘时重复上报。保留历史验收文件；删除和发布需明确授权。
