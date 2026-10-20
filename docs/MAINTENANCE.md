# 当前维护入口（0.5.0，本地候选）

`npm test` 运行引擎、身份/数据/ledger与续玩逻辑；`npm run build` 按 `config/runtime-files.json` 输出静态包；`npm run validate` 检查输入与最终输出SHA、兼容资源和发布文件清单；`npm run test:resume` 用 Playwright 验证选择/结算/重复恢复/异常存档与布局。浏览器依赖由开发环境安装或显式 `KPL_PLAYWRIGHT_PATH` 提供，产品零运行时依赖。构建不会自动重生成模型或同步数据。

维护已冻结消费快照后单独运行 `npm run data:manifest -- --source-commit=<实际输入源完整SHA>`，审阅差异，再构建和validate。`data/consumption-manifest.json` 对应原始输入和最终27队徽；`runtime/ledger.js` 是 `runtime/ledger.mjs` 原字节，仅扩展名改变。sourceCommit为实际消费仓库快照来源，不代表补齐所有上游官方原始证据。null/未知不能改为零，p_a/p_b为0..1比例，赔率为含本金十进制倍数；金额仍由唯一账本处理。

运行包排除未被正式页面引用的 `coin-official-v2.json` 和 `official-manifest.json`，两者留在源码。V1数据及其资源因 `?dataset=v1` 冻结验收链接继续保留。没有删除历史文件。原 README 中历史说明已归档为 `HISTORY_README_0.4.3.md`，旧验收报告仍只代表当时版本。

存档绑定0.5.0、所选数据与账本hash、模式与筛选，通过原状态转换重放；清空存档为显式“重新开始”。暂停/返回首页/刷新可恢复，已结算不会重复结算；恢复完成页保留完成埋点去重标记。localStorage满或不可用时提示无法保存，仍可游玩。没有账号或云同步。损坏/版本不兼容保留原值并提示，不擅自迁移金额。

112个评级实体不等于112家已验证连续俱乐部；85个无本地队徽实体使用文字fallback。历史精确时刻、部分杯赛对手连续性、来源证据强度保持原未知。BO2只读档案不进入倍率、Elo、预测和账本。数据及ledger字节未变化。

Coin统计保持关闭。预备事件为select-mode/select-team/start/complete/recap/copy，只有后续同时变更平台白名单、静态端点与产品开关并经授权才可接入。自动浏览器必须webdriver屏蔽并网络阻断统计。真机、人工试听、生产部署/CDN/大陆网络均不由本地测试代替。
