"""D 本地验收：真实 npm 命令、冻结字节、可复核统计样本，不改上游产物。"""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

FRONT = Path(__file__).resolve().parents[1]
ROOT = FRONT.parent
OUT = FRONT / 'verification-d'

def run():
    OUT.mkdir(exist_ok=True)
    checks = []
    for name, command in [('npm-test', ['cmd.exe', '/d', '/c', 'npm', 'test']),
                          ('npm-build', ['cmd.exe', '/d', '/c', 'npm', 'run', 'build'])]:
        result = subprocess.run(command, cwd=FRONT, capture_output=True, encoding='utf-8', errors='replace')
        (OUT / (name+'.log')).write_text(result.stdout + result.stderr, encoding='utf-8')
        checks.append({'name':name, 'exit_code':result.returncode})
    lock = json.loads((ROOT/'audit-b1/config/baseline-lock.json').read_bytes())
    changed = []
    for name, want in lock['files'].items():
        if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=want: changed.append(name)
    archive = ROOT/'KPL_Coin_Work_Package_C_Acceptance_20261013.zip'
    n = 0
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            if not name.startswith('kpl-coin/'): continue
            rel = name.removeprefix('kpl-coin/')
            if rel.startswith('frontend/') and not rel.startswith(('frontend/data/','frontend/runtime/','frontend/assets/')): continue
            p = ROOT/rel
            if p.is_file():
                n+=1
                if hashlib.sha256(z.read(name)).digest()!=hashlib.sha256(p.read_bytes()).digest(): changed.append(rel)
    frozen = {'all_passed':not changed,'A_B_locked_files':len(lock['files']),
              'C_archive_upstream_and_UI_frozen_assets_checked':n,'changed':changed}
    (OUT/'frozen-results.json').write_text(json.dumps(frozen,indent=2)+'\n',encoding='utf-8')
    checks.append({'name':'frozen-bytes','exit_code':int(bool(changed))})
    report = {'all_passed':all(x['exit_code']==0 for x in checks),'checks':checks}
    (OUT/'logic-build-results.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))
    if not report['all_passed']: raise SystemExit(1)

if __name__=='__main__': run()
