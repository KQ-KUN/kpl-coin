"""C正式UI快照。比分/BO/阶段/逐场历史名仅取A，概率/报价仅取B V1。"""
import argparse
import json
from pathlib import Path
import sys

FRONT = Path(__file__).resolve().parents[1]
PACKAGE = FRONT.parent
sys.path.insert(0,str(PACKAGE/'scripts'))
from coin_model import load_snapshot, encoded, sha, QUARANTINED


def artifacts():
    matches,teams,seasons,lock=load_snapshot()
    b=json.loads((PACKAGE/'output-b/runtime/coin-runtime-v1.json').read_bytes())
    b_manifest=json.loads((PACKAGE/'output-b/b-manifest.json').read_bytes())
    if sha((PACKAGE/'output-b/runtime/coin-runtime-v1.json').read_bytes())!=b_manifest['outputs']['runtime/coin-runtime-v1.json']['sha256']:
        raise ValueError('B V1 runtime changed')
    fr=json.loads((PACKAGE/'evidence/inputs/data/processed/franchises.json').read_bytes())['franchises']
    franchises={r['franchise_id']:r for r in fr}
    by_id={m['id']:m for m in matches}
    names=sorted({m['team_'+s]['historical_name'] for m in matches for s in ('a','b')})
    stages=sorted({(m['stage']['category'],m['stage']['name']) for m in matches},key=lambda v:(v[0],v[1] or ''))
    qualities=sorted({m['quality']['status'] for m in matches})
    team_rows=[]; assets={}; icons={}
    frozen_manifest=json.loads((FRONT/'data/assets-manifest.json').read_bytes()) if (FRONT/'data/assets-manifest.json').exists() else None
    for t in teams:
        tid=t['id']; played=[m for m in matches if tid in (m['team_a']['id'],m['team_b']['id'])]
        latest=played[-1]; side='a' if latest['team_a']['id']==tid else 'b'
        display=latest['team_'+side]['historical_name']
        ab=franchises[t['provider_id']]['abbreviations']
        short=ab[0] if ab else display
        if tid=='smoba:10101:fire-leopard-2022': short='火豹'
        if tid=='smoba:10101:uug-2025': short='UUG'
        icon=None
        # provider10101已拆分，当前UUG队徽不能赋给2022火豹。
        if tid!='smoba:10101:fire-leopard-2022':
            icon_name=f"assets/teams/{t['provider_id']}.png"
            # 队徽已作为C源码资产冻结；后续复现不依赖原kpl2k目录或它的实时改动。
            source=FRONT/icon_name
            if not source.exists() and frozen_manifest is None:
                source=PACKAGE.parent/'app/assets/team_icons'/f"{t['provider_id']}.png"
            if source.exists():
                blob=source.read_bytes()
                if not blob.startswith(b'\x89PNG\r\n\x1a\n'): raise ValueError('not PNG')
                if frozen_manifest and sha(blob)!=frozen_manifest['icons'][icon_name]['sha256']:
                    raise ValueError('frozen icon changed: '+icon_name)
                icon=icon_name
                assets[icon]=blob
                icons[icon]={'sha256':sha(blob),'source':f"app/assets/team_icons/{t['provider_id']}.png",'bytes':len(blob)}
        team_rows.append({'id':tid,'short_name':short,'display_name':display,'icon':icon,
            'icon_status':'existing_current_snapshot' if icon else 'historical_icon_unavailable',
            'first_date':played[0]['start']['date'],'last_date':played[-1]['start']['date'],
            'match_count':len(played),'provider_id':t['provider_id']})
    rows=[]
    for old in b['matches']:
        m=by_id[old[0]]
        if m['id'] in QUARANTINED or m['quality']['settleable'] is not True: raise ValueError('quarantine')
        rows.append([*old,m['score']['a'],m['score']['b'],m['format']['best_of'],
            stages.index((m['stage']['category'],m['stage']['name'])),qualities.index(m['quality']['status']),
            names.index(m['team_a']['historical_name']),names.index(m['team_b']['historical_name'])])
    data={'schema_version':'coin-ui-1.0.0','model_version':'elo-day-v1.0.0',
        'odds_label':'模型模拟赔率，并非历史真实盘口。','snapshot_matches_sha256':lock['snapshot_sha256']['matches.json'],
        'B_runtime_sha256':sha((PACKAGE/'output-b/runtime/coin-runtime-v1.json').read_bytes()),
        'cutoff':'2026-09-12','actual_timestamps_verified':False,'quarantined_count':3,
        'columns':[*b['columns'],'score_a','score_b','best_of','stage_index','quality_index','name_a_index','name_b_index'],
        'teams':team_rows,'seasons':[{'id':s['id'],'name':s['name'],'first_date':s['first_match_date'],'last_date':s['last_match_date']} for s in seasons],
        'stages':[{'category':c,'source_name':n} for c,n in stages],'quality_statuses':qualities,
        'historical_names':names,'matches':rows}
    blob=encoded(data,compact=True)
    if len(blob)>512*1024: raise ValueError('UI runtime exceeds budget')
    ledger=(PACKAGE/'runtime/ledger.mjs').read_bytes()
    assets.update({'data/coin-ui-v1.json':blob,'runtime/ledger.mjs':ledger})
    manifest={'schema_version':'coin-ui-1.0.0','model_version':'elo-day-v1.0.0',
        'counts':{'matches':1989,'teams':27,'seasons':16,'quarantined':3},'runtime_budget_bytes':524288,
        'runtime_bytes':len(blob),'canonical_ledger_sha256':sha(ledger),'icons':icons,
        'assets':{name:{'bytes':len(value),'sha256':sha(value)} for name,value in sorted(assets.items())}}
    assets['data/assets-manifest.json']=encoded(manifest)
    return assets

def main():
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');a=p.parse_args()
    files=artifacts()
    for name,blob in files.items():
        f=FRONT/name
        if a.check:
            if not f.exists() or f.read_bytes()!=blob:raise ValueError('UI asset changed: '+name)
        else:f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(blob)
    print(json.dumps({'files':len(files),'runtime_bytes':len(files['data/coin-ui-v1.json'])}))
if __name__=='__main__':main()
