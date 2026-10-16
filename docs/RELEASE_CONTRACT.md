# KPL Coin 0.4.3 发布合同

2026-10-16 收尾修订。应用版本仍为0.4.3，候选标识为 0.4.3-rc.1；仅更新文档与发布验收材料，不调整玩法、赛事、模型、赔率或账本。旧C/D/E文档、ZIP和旧V1是各自阶段的冻结证据。

|项目|当前默认扩展版|旧V1（仅冻结审计链接）|
|---|---|---|
|数据文件|coin-official-v2.1.json|coin-ui-v1.json|
|schema|coin-official-2.1.0|coin-ui-1.0.0|
|模型|elo-day-official-v2.1.0|elo-day-v1.0.0|
|可预测系列|2,631：联赛1,989、杯赛642|1,989|
|评级实体 / 赛事单元|112 / 29|27 / 16|
|AG全部范围死忠|327场，13,572.36枚，净收益+3,572.36|268场，12,077.03枚，净收益+2,077.03|

当前扩展模型的“联赛”过滤同为1,989场，但使用v2.1原有赛前价格，**不是旧V1**；该过滤下AG268场、11,627.89枚。默认首页无V1入口，?dataset=v1仅保留历史审计。

release.json顶层model/schema描述兼容V1载荷；默认加载器实际校验release.official的模型、schema、大小与SHA。不能只读顶层字段判断默认模型。所有倍率称“模型模拟赔率，并非历史真实盘口”。

## 构建与冻结

Node.js24，本轮24.19.0，npm锁文件v3，零安装依赖。执行 npm ci --ignore-scripts --no-audit --no-fund --offline、npm test、npm run build。运行/构建无需Python、KPL 2K或网络赔率API；可选浏览器验收需开发环境Playwright与Edge。

原模型、数据、唯一账本、engine/challenge和26张队徽逐字节保留。火豹历史补图独立绑定实体，来源见UI_ASSETS.md。源码.mjs转换为.js；ledger.js仍与B原账本逐字节相同。

build_id绑定源码、运行资源、构建脚本及锁文件。HTML、模块、release.json与默认扩展manifest必须同版本，数据另验SHA。混合版本必须停止初始化并提示重新加载。这是缓存一致性检查，不是数字签名或客户端防作弊。

dist/build-manifest.json的files不含清单自身：当前48个被列举文件，加清单共49个物理发布文件。以候选SHA清单为准；测试、文档、审计材料和Playwright不进入正式dist。

## 子路径与平台

npm start -- --coin-path验证独立/coin/；默认npm start仍为根目录预览。模块、CSS、JSON、PNG全部相对路径同源，游戏中心链接回/。刷新新会话，浏览器导航不是存档；后台和pagehide暂停，恢复需明确继续。

平台以真实Coin远程提交锁定注册表。收集器仅向index插入/shared/analytics.js，其余48个物理文件须与独立构建相同；另记录聚合index哈希。/coin和/coin/index.html需规范化到/coin/；缺失资源真404，不重写为Portal。

Coin目录所有文件应重验证缓存：Cache-Control: public, max-age=0, must-revalidate。未内容寻址的文件名不设immutable。云端规则、HTTPS、MIME和404仍须获批预览实测，本地模拟不能替代EdgeOne验收。

Coin meta CSP限制同源脚本/样式/图像/连接；保留平台响应头frame-ancestors、nosniff、Permissions-Policy、Referrer-Policy和HSTS。不需放宽全站CSP或新增运行时外域白名单。

## 埋点保持关闭

ANALYTICS_ENABLED=false、HTML data-coin-analytics=disabled、release.json analytics_enabled=false三者均保持。已有6个固定游戏钩子不发送。当前远程平台不识别Coin页面/事件；首发方案不扩充白名单，不把开启埋点作为首发前提。

以后另行批准统计时才同步更新页映射、固定事件白名单、生成端点、QA禁用守卫、来源白名单测试与Coin开关。当前平台helper只排除webdriver，不识别?kpl_analytics=off或KPL_ANALYTICS_DISABLED，不能声称它们已在全站生效。当前Coin依靠开关关闭和无Coin页映射实现零上报。自动测试拦截并拒绝/__event/；生产smoke沿用safeFetch禁止事件请求。

## 发布及回滚

本轮不创建远程仓库、不推送、不启用入口、不打开埋点、不部署。阻断项与最小平台差异见RELEASE_CANDIDATE_0.4.3.md及随包release-0.4.3/docs/。

首次接入不能直接运行release:game coin：最新脚本要求Coin已注册启用、真实远程main和锁定ref。首次发布需先审核独立仓库与新增注册项；后续常规更新才走该脚本。即使--dry-run也做网络认证、临时改ref和聚合重建，本轮不在正式平台执行。

回滚恢复上一份完整平台产物，或平台commit加全部游戏refs；首次发布回到Coin尚未注册的版本。仅隐藏Portal入口或只回滚JSON都不充分。回滚后核验release-meta、既有游戏、Coin路径状态与零事件请求。

