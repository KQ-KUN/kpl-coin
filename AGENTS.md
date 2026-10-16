# KPL Coin 前端

遵循平台 `../../kplgame/docs/UI_STANDARD.md` 和 `EDITORIAL_IMPLEMENTATION.md` 的暖纸色刊物风格。独立静态项目，不修改KPL GAME生产配置或部署。

独立验收包没有平台目录时，可读`docs/REFERENCE_UI_STANDARD.md`和`REFERENCE_EDITORIAL_IMPLEMENTATION.md`；二者是2026-10-13只读快照，不自动同步平台修改。

唯一金额公式来自已验收 `../runtime/ledger.mjs`。`runtime/ledger.mjs`是逐字节生成的依赖快照，修改源B文件或另写结算公式均禁止。A/B/B.1文件保持原字节。

`data/coin-ui-v1.json`和现有队徽快照由`tools/export_ui_data.py`生成；开发构建只使用本前端内的冻结资源。不得从前端加载审计结构、真实盘口API、原仓库或第三方字体。
