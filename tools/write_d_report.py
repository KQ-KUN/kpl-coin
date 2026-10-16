"""把已完成测试的实际值写入D报告，耗时不手填。"""
from pathlib import Path
import json

FRONT=Path(__file__).resolve().parents[1]

def run():
    d=json.loads((FRONT/'verification-d/browser-results.json').read_bytes())
    logic=json.loads((FRONT/'verification-d/logic-build-results.json').read_bytes())
    assert d['all_passed'] and logic['all_passed']
    raw=json.loads((FRONT/'data/coin-ui-v1.json').read_bytes())
    teams={t['id']:t['short_name'] for t in raw['teams']}
    seasons={s['id']:s['name'] for s in raw['seasons']}
    times='\n'.join(f"| {teams[r['team_id']]} | {r['seconds']:.2f}秒 | {r['final']} |" for r in d['recap_times'])
    stats='\n'.join(f"| {teams[r['team_id']]} | +{r['maxSingleProfit']} | {r['maxSingleLoss']} | {seasons[r['bestSeason']['seasonId']]} / {r['bestSeason']['net']} | {seasons[r['worstSeason']['seasonId']]} / {r['worstSeason']['net']} |" for r in d['metrics'])
    report=f'''# Work Package D 验收

2026-10-13。前端0.2.0在C上完成体验优化，模型仍为elo-day-v1.0.0。没有重新调优赔率或改动任何真实赛果、质量状态和唯一账本。完成后停止，等待反向审计；没有接入KPL GAME或生产部署。

## 改动与实际游玩

死忠保留1×/3×/10×，新增极速回顾。每帧推进多个原有事件，每场place/settle照常执行；当前年份、赛季、进度、总资产及曲线持续更新。总决赛、连续命中和大幅日期批下跌使用短时文字反馈，最多8次延长停留。手机极速布局把曲线提前，年份、总资产和轨迹同屏。随时暂停、改速、跳至结算、重启或换队，后台自动暂停且不自动追回时间。

操盘默认指定赛季＋战队，2020春AG为18场，而非1989场。另有赛季全部比赛、完整战队V1队史、全历史高级挑战。开始前明确赛事、实际场数、首末日期；空范围禁用。只过滤原始记录，保留完整实体ID，火豹与UUG仍分离。每次挑战10000本金，50/100/200/500投入规则不变。

揭晓显示真实双方大比分、命中/未命中文字、正负硬币和总资产。总决赛增加细红边框。180ms数字位置滚动及透明度反馈直接展示准确金额，不插值账本数值；暂停/切速/隐藏/重启可以取消。键盘操作与reduced-motion不启动揭晓动画。没有随机奖励、额外本金、充值或新依赖。

按用户补充统一为中国市场配色：红涨绿跌，零收益保持中性色。净收益、揭晓反馈、极值及资产曲线同时更新颜色，正负符号不省略；所有金额和曲线点均不变。

赛前近五场来自完整历史，严格只纳入结果可用日期早于当前比赛日期的记录，同日结果不纳入。挑战开始前的其他赛季可以提供已知过去信息；缺少记录不补造。没有使用最终排名、之后的战绩或未来阵容。

结算保留C全部指标，新增最高单场净收益、最大单场亏损、最辉煌和最惨淡赛季。手机战绩卡带冻结队徽、完整资产轨迹及日期范围，适合截取卡片和复制文字。新增统计口径详见[体验合同](EXPERIENCE_D_CONTRACT.md)。

## 实测耗时

Edge {d['browser']}桌面无头，390×844视口，真实计时器自动走完，没有使用跳至结算替代计时。

| 战队 | 极速回顾 | 最终硬币 |
| --- | --- | --- |
{times}

保留10×的AG268场为{d['natural_AG_10x_seconds']:.2f}秒；reduced-motion的AG极速为{d['reduced_AG_recap_seconds']:.2f}秒且最终12077.03。上述是本机实测，不保证所有设备固定15秒，少量比赛的战队会提前结束。

## 金额、筛选与统计验证

`npm test`26/26通过，含原C15项。27个实体极速与普通回放的每一条record、完整ledger、每个日期批curve及所有statistics完全一致。AG268＋狼队277＋eStar235共780场仍与B冻结账本逐场对账。动画只作用DOM，开启和reduced-motion的真实播放都获得同一最终资产。

全16赛事×27实体组合的过滤与冻结行集合完全一致；每个非空赛季/战队组合以胜、负、跳过混合决策结清。非法范围、空范围、余额不足、重复确认和重复结束均受测。另跑10轮完整1989场操盘固定混合决策压力测试，现金不负、预留结清、ID唯一且净收益守恒。

全部1989场双方近五场与独立逐行筛选核对，改变当前日及未来赛果不能改变此前赛前信息。新极值独立对照B逐场/逐季冻结结果；未参与返回空值、无相应收益方向为0、赛季平手取最早已参与赛季均有测试。

| 战队 | 单场最高净收益 | 最大单场亏损 | 最辉煌赛季 / 净收益 | 最惨淡赛季 / 净收益 |
| --- | --- | --- | --- | --- |
{stats}

`npm run build`成功，36个静态资源。运行时JSON{d['runtime_bytes']}字节，约268.12KiB，低于512KiB预算；没有新增依赖、在线赔率或审计结构请求。102份A/B锁定文件，以及C包中193份上游/冻结UI资产逐字节核对，无变化。原C ZIP和C截图仍保留。

## 浏览器与移动端证据

{len(d['checks'])}项真实浏览器检查通过，无控制台/pageerror/404，资源均同源。320/360/375/390/430/768/1024/1366/1440的首页、普通回放和结果无横向溢出；360/390/430为重点截图。包括200%CSS布局缩放、键盘focus、reduced-motion、按钮至少44px、资产SVG同一path复用、长期自然回放、20次高频切速、重启、换队、极速中止及受控隐藏/恢复。

Android风格视口/UA/触摸模拟使用桌面Chromium，点击/触摸完整结算通过。没有真实Android Chrome设备，不能记作Chrome真机通过。当前环境没有WebKit测试运行时，也没有iOS设备，Safari未验收。200%测试为CSS布局缩放，尚未验证手机系统字体缩放；visibilitychange为受控事件，尚未验证系统冻结/恢复。复制用测试剪贴板替身，不触碰个人剪贴板。

## C 与 D 对比截图

左列为保留的C真实浏览器图，右列为D同一390px视口；不是概念稿。

| C 普通回放 | D 普通回放 |
| --- | --- |
| ![C](../verification-d/before/loyal-390.png) | ![D](../verification-d/screenshots/loyal-390.png) |

| C 结算 | D 结算 |
| --- | --- |
| ![C](../verification-d/before/result-390.png) | ![D](../verification-d/screenshots/result-390.png) |

| C 操盘赛前 | D 已知近五场赛前 |
| --- | --- |
| ![C](../verification-d/before/trader-preview-390.png) | ![D](../verification-d/screenshots/trader-form-390.png) |

[D操盘范围选择](../verification-d/screenshots/trader-setup-390.png) · [极速回顾](../verification-d/screenshots/recap-390.png) · [AG战绩卡](../verification-d/screenshots/share-10027-390.png)。D共有24张截图，另保留4张C对比图。完整测试值、各队指标和请求清单在`verification-d/browser-results.json`；npm原始日志、冻结检查在同目录。

## 当前限制

极速压缩了文字阅读时间，只展示最新比分片段，不是每一场都停留；完整结算、曲线和逐季统计没有丢失，玩家可暂停或切回常规速度阅读。手机曲线同屏布局在390px实测，低性能手机帧率、内存峰值和真实网络冷加载尚未测量。

结算卡保留全部指标，仍高于一屏，可单独截取长卡；没有加入Canvas图片导出或上传服务。刷新重置，无持久化存档。客户端文件包含历史答案，不提供防作弊保证。26张队徽是现有快照，火豹仍用缺图文字，不能把当前UUG图标继承给火豹。

未核实分钟时刻、三场隔离缺口、V1模型偏差、素材再分发许可沿用已有审计边界。本轮不扩大数据范围，也不把模拟收益解释为现实博彩收益。

## 下一阶段部署准备（未执行）

- D反向审计通过，冻结版本及ZIP/hash；确认公开再分发的数据与队徽许可。
- 真机Android Chrome和iOS Safari验收触摸、系统字体缩放、隐藏/恢复、剪贴板和长时间回放。
- 在低性能手机及移动网络测冷加载、帧率、内存；确定静态压缩、缓存与资源预算。
- 核验目标子路径静态资源路径、HTTPS、CSP和错误页面；保留可复现构建及回滚包。
- 另行确认是否需要本地存档及其版本迁移；不默认增加账户或后台。
- 得到正式接入授权后，才修改KPL GAME注册/生产配置，并独立验收生产资源与核心玩法。

本地运行仍为Node20+，双击START-KPL-COIN.cmd或npm run build后npm start。没有npm install要求。D至此停止。
'''
    (FRONT/'docs/WORK_PACKAGE_D_ACCEPTANCE.md').write_text(report,encoding='utf-8')
    print('D report generated from passed test evidence')

if __name__=='__main__': run()
