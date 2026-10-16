# 0.4.3-rc.1 验收入口

2026-10-16，应用版本0.4.3，模型elo-day-official-v2.1.0，schema coin-official-2.1.0。本次只修订过时文档、准备集成差异与发布验证；不新增玩法、赛事、赔率或视觉改版。

当前默认验收AG327场、13,572.36枚；狼队347场、14,420.84枚；eStar284场、9,860.79枚。当前扩展联赛AG268场11,627.89；旧V1 AG268场12,077.03仅作冻结审计。历史操盘为选边后确认、立即逐场揭晓，死忠仍日期批结算。

全部/联赛/杯赛仅是死忠范围过滤；操盘独立用赛季与战队选范围。2022世冠82场可预测，48场BO2仅结算后只读展示，包含3场平局，全部BO2不参与Elo或账本。

## 当前有效文档

- README.md：当前本地启动、默认结果和玩法。
- RELEASE_CONTRACT.md：版本、子路径、缓存、统计及回滚合同。
- DATA_AND_ENGINE.md：当前schema、身份、两种结算时序和旧V1区别。
- MOBILE_SELF_TEST.md：Android Chrome / iOS Safari手工步骤，均待用户真机验证。
- 完整验收包release-0.4.3/docs/PLATFORM_INTEGRATION.md：远程平台固定提交、最小未应用差异及授权后执行顺序。
- 完整验收包release-0.4.3/docs/RESOURCE_RIGHTS.md及reports/resource-inventory.csv：资源来源、使用状态与未确认授权。
- 完整验收包release-0.4.3/REPORT.md及reports/：本轮结果、哈希、测试与阻断项。

旧WORK_PACKAGE_C/D与preflight-e报告、审计模型输出和历史ZIP保持不变，数值仅对各自版本有效。dist/release.json的顶层model/schema为兼容V1字段，默认以official字段为准。

本轮未创建/推送远程仓库、未启用/coin/、未打开埋点、未部署。完整公开生产上线仍需真机和授权问题闭环、真实远程Coin提交及正式全站聚合验收；自动构建通过不能替代这些条件。
