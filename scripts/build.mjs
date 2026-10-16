import {readFile,mkdir,readdir,writeFile,mkdtemp,rename,rm,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {decode} from '../src/data.mjs';
import {ANALYTICS_ENABLED} from '../src/analytics.mjs';
import {decodeOfficial} from '../src/official-data.mjs';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function build(){
  const manifest=JSON.parse(await readFile(path.join(root,'data/assets-manifest.json'),'utf8'));
  for(const [name,record]of Object.entries(manifest.assets)){
    const blob=await readFile(path.join(root,name));if(hash(blob)!==record.sha256)throw Error('冻结资源变化: '+name);
  }
  const dataBlob=await readFile(path.join(root,'data/coin-ui-v1.json'));
  if(dataBlob.length>manifest.runtime_budget_bytes)throw Error('运行时数据过大');
  decode(JSON.parse(dataBlob));
  const officialBlob=await readFile(path.join(root,'data/coin-official-v2.1.json'));
  const officialManifest=JSON.parse(await readFile(path.join(root,'data/official-manifest-v2.1.json')));
  if(hash(officialBlob)!==officialManifest.sha256||officialBlob.length>officialManifest.budget_bytes||officialManifest.ledger_sha256!==manifest.assets['runtime/ledger.mjs'].sha256)throw Error('官方扩展资源变化');
  decodeOfficial(JSON.parse(officialBlob));
  const files=['index.html','styles.css'];
  for(const folder of ['src','runtime','data','assets']){
    async function walk(dir){for(const item of await readdir(path.join(root,dir),{withFileTypes:true})){
      const name=path.posix.join(dir,item.name);if(item.isSymbolicLink())throw Error('构建资源不得使用符号链接');if(item.isDirectory())await walk(name);else files.push(name);
    }}await walk(folder);
  }
  files.sort();const inputs={};const digest=createHash('sha256');
  for(const name of [...files,'scripts/build.mjs','package.json','package-lock.json']){
    const bytes=await readFile(path.join(root,name));inputs[name]={bytes:bytes.length,sha256:hash(bytes)};
    digest.update(name+'\0').update(bytes);
  }
  const buildId=digest.digest('hex');const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  const stage=await mkdtemp(path.join(root,'.coin-build-'));
  // 只清理本次生成、已核实在独立前端目录内的输出临时目录。
  const clean=async dir=>{if(!path.resolve(dir).startsWith(root+path.sep))throw Error('构建清理路径越界');await rm(dir,{recursive:true,force:true});};
  const outputs={};let old=null;
  try{
    for(const name of files){
      const outName=name.endsWith('.mjs')?name.slice(0,-4)+'.js':name;
      const target=path.join(stage,outName);await mkdir(path.dirname(target),{recursive:true});
      let bytes=await readFile(path.join(root,name));
      if(name.endsWith('.mjs'))bytes=Buffer.from(bytes.toString('utf8')
        .replace(/((?:from\s*|import\s*|import\s*\()\s*['"])(\.[^'"]+)\.mjs(['"])/g,(_m,a,b,c)=>`${a}${b}.js?v=${buildId}${c}`)
        .replace('__COIN_BUILD_ID__',buildId));
      if(name==='index.html')bytes=Buffer.from(bytes.toString('utf8')
        .replace('<html lang="zh-CN">',`<html lang="zh-CN" data-build="${buildId}" data-version="${pkg.version}" data-coin-analytics="${ANALYTICS_ENABLED?'approved':'disabled'}">`)
        .replace('./src/app.mjs',`./src/app.js?v=${buildId}`).replace('./styles.css',`./styles.css?v=${buildId}`));
      await writeFile(target,bytes);outputs[outName]={bytes:bytes.length,sha256:hash(bytes)};
    }
    if(outputs['runtime/ledger.js'].sha256!==manifest.assets['runtime/ledger.mjs'].sha256)throw Error('账本构建内容变化');
    const release={version:pkg.version,build_id:buildId,schema:'coin-ui-1.0.0',model:'elo-day-v1.0.0',analytics_enabled:ANALYTICS_ENABLED,
      runtime_sha256:hash(dataBlob),ledger_sha256:manifest.assets['runtime/ledger.mjs'].sha256,
      official:{schema:officialManifest.schema_version,model:officialManifest.model_version,sha256:officialManifest.sha256,bytes:officialBlob.length}};
    const releaseBytes=Buffer.from(JSON.stringify(release,null,2)+'\n');await writeFile(path.join(stage,'release.json'),releaseBytes);
    outputs['release.json']={bytes:releaseBytes.length,sha256:hash(releaseBytes)};
    const result={name:'KPL Coin',...release,runtime_bytes:dataBlob.length,standalone:true,source_files:inputs,files:outputs};
    await writeFile(path.join(stage,'build-manifest.json'),JSON.stringify(result,null,2)+'\n');
    const dest=path.join(root,'dist');const current=await lstat(dest).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
    if(current?.isSymbolicLink()||current&&!current.isDirectory())throw Error('dist不是普通构建目录');
    if(current){old=await mkdtemp(path.join(root,'.coin-old-'));await rename(dest,path.join(old,'dist'));}
    try{await rename(stage,dest);}catch(e){if(old)await rename(path.join(old,'dist'),dest);throw e;}
    if(old)await clean(old);return result;
  }finally{await clean(stage);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const b=await build();console.log(JSON.stringify({files:Object.keys(b.files).length,runtime_bytes:b.runtime_bytes,dist:path.join(root,'dist')}));
}
