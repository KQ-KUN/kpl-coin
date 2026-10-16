"""本地D独立可玩包及完整验收包：不覆盖A/B/C档案，包含哈希清单与解压验收。"""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import zipfile

FRONT=Path(__file__).resolve().parents[1]
ROOT=FRONT.parent
OUT=FRONT/'verification-d'
PLAY=ROOT/'KPL_Coin_D_MVP_20261013.zip'
FULL=ROOT/'KPL_Coin_Work_Package_D_Acceptance_20261013.zip'
SKIP={'browser-temp','tmp','node_modules','__pycache__','.git'}

def files(base):
    for here,dirs,names in os.walk(base):
        dirs[:]=sorted(d for d in dirs if d not in SKIP and not d.startswith('.env'))
        for name in sorted(names):
            p=Path(here)/name
            if name.startswith('.env') or name.startswith('KPL_Coin_D_') or name.startswith('KPL_Coin_Work_Package_D_'):continue
            if name.startswith('KPL_Coin_C_MVP_'):continue
            if p==OUT/'package-results.json':continue
            yield p

def pack(target,base,prefix):
    records={}
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        def put(name,blob):
            info=zipfile.ZipInfo(prefix+'/'+name,(2026,10,13,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644<<16;z.writestr(info,blob,compresslevel=9)
        for p in files(base):
            name=p.relative_to(base).as_posix();blob=p.read_bytes();records[name]={'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()};put(name,blob)
        intro='KPL Coin Work Package D / 前端0.2.0\nNode20+，无需npm install。进入frontend目录（独立包为当前目录），双击START-KPL-COIN.cmd。\n请读docs/WORK_PACKAGE_D_ACCEPTANCE.md（完整包位于frontend/docs）。\n红涨绿跌，纯虚拟计分，模型与唯一账本不变；没有部署。\n'
        put('ACCEPTANCE_README.txt',intro.encode('utf-8'))
        put('PACKAGE_MANIFEST.json',(json.dumps(records,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        for name,record in records.items():assert hashlib.sha256(z.read(prefix+'/'+name)).hexdigest()==record['sha256']
    digest=hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(target.suffix+'.sha256').write_text(digest+'  '+target.name+'\n',encoding='utf-8')
    return {'path':str(target),'bytes':target.stat().st_size,'sha256':digest,'verified':True,'files':len(records)}

def extract(archive,directory):
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            path=PurePosixPath(name)
            assert not path.is_absolute() and '..' not in path.parts
        z.extractall(directory)

def run():
    assert json.loads((OUT/'logic-build-results.json').read_bytes())['all_passed']
    assert json.loads((OUT/'browser-results.json').read_bytes())['all_passed']
    pack(PLAY,FRONT,'kpl-coin-frontend');pack(FULL,ROOT,'kpl-coin')
    checks=[];temp_parent=OUT/'tmp';temp_parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='d-independent-',dir=temp_parent) as temporary:
        temp=Path(temporary).resolve()
        # TemporaryDirectory只清理本次生成且核实在工作区内的目录。
        assert temp.is_relative_to(temp_parent.resolve())
        extract(PLAY,temp/'play');extract(FULL,temp/'full')
        for name,cmd,cwd in [
            ('standalone-npm-test',['cmd.exe','/d','/c','npm','test'],temp/'play/kpl-coin-frontend'),
            ('standalone-npm-build',['cmd.exe','/d','/c','npm','run','build'],temp/'play/kpl-coin-frontend'),
            ('full-frozen-verification',[sys.executable,'tools/verify_d.py'],temp/'full/kpl-coin/frontend')]:
            r=subprocess.run(cmd,cwd=cwd,capture_output=True,encoding='utf-8',errors='replace')
            (OUT/(name+'.log')).write_text(r.stdout+r.stderr,encoding='utf-8');checks.append({'name':name,'exit_code':r.returncode})
    result={'all_passed':all(x['exit_code']==0 for x in checks),'checks':checks}
    (OUT/'standalone-results.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    if not result['all_passed']:raise SystemExit('independent extraction failed')
    # 第二次把解压验收日志包含在包内；外部package-results不进入包，避免自引用哈希。
    report={'playable':pack(PLAY,FRONT,'kpl-coin-frontend'),'full_acceptance':pack(FULL,ROOT,'kpl-coin'),
            'independent_extracted_checks':checks}
    (OUT/'package-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':run()
