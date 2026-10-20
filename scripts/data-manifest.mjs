import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {decode} from '../src/data.mjs';
import {decodeOfficial} from '../src/official-data.mjs';
import {teamIcon} from '../src/presentation.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceCommit=process.argv.find(a=>a.startsWith('--source-commit='))?.split('=')[1]??execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw Error('必须提供完整sourceCommit');
const names=['data/coin-ui-v1.json','data/coin-official-v2.1.json','data/assets-manifest.json','data/official-manifest-v2.1.json','runtime/ledger.mjs'];
const inputs=[];
for(const name of names){const b=await fs.readFile(path.join(root,name));inputs.push({path:name,sha256:hash(b)});}
const v1=decode(JSON.parse(await fs.readFile(path.join(root,names[0]),'utf8')));
const official=decodeOfficial(JSON.parse(await fs.readFile(path.join(root,names[1]),'utf8')));
const icons=new Set(official.teams.map(teamIcon).filter(Boolean));
const outputs=inputs.map(row=>({...row,...(row.path.endsWith('.mjs')?{path:row.path.replace(/\.mjs$/,'.js'),sourcePath:row.path}:{})}));
for(const row of outputs)row.bytes=(await fs.stat(path.join(root,row.sourcePath??row.path))).size;
let finalLocalTeams=0;
for(const team of official.teams){const icon=teamIcon(team);if(icon&&(await fs.stat(path.join(root,icon)).catch(()=>null))?.isFile())finalLocalTeams++;}
for(const icon of icons){const b=await fs.readFile(path.join(root,icon));outputs.push({path:icon,sha256:hash(b),bytes:b.length});}
const quality={duplicatePlayerIds:'not applicable: team challenge',teamEntities:official.teams.length,matchIdsUnique:new Set(official.rows.map(r=>r.id)).size===official.rows.length,
  missingTeamIcons:official.teams.length-finalLocalTeams,unverifiedFacts:['Actual match timestamps remain not fully verified.','Entity continuity for isolated cup opponents is not inferred.','Historical alias/brand labels are scoped to the frozen snapshot.']};
const manifest={schemaVersion:1,sourceCommit,inputs,outputs,generatedAt:new Date().toISOString(),
 coverage:{officialMatches:official.rows.length,v1CompatibilityMatches:v1.rows.length,teamEntities:official.teams.length,cutoff:official.metadata.cutoff,provenance:'Frozen consumption repository inputs; no new raw data collected.'},
 exclusionRules:['Quarantined rows stay excluded.','BO2 archive is display only: excluded from odds, Elo, decisions and ledger.','Unused v2.0 audit files remain source-only; v1 acceptance links retain their required runtime files.'],
 generator:{name:'scripts/data-manifest.mjs',version:hash(await fs.readFile(fileURLToPath(import.meta.url)))},
 semantics:{null:'unknown or not applicable; never an assumed zero',emptyString:'invalid for required IDs',zero:'a measured zero only when the field contract permits it',probabilityUnit:'p_a/p_b are fractions 0..1',odds:'decimal multiplier, return includes principal',money:'only runtime/ledger.mjs converts and settles minor units'},
 resources:{originalTeamIconReferences:official.teams.filter(t=>t.icon).length,finalLocalTeamReferences:finalLocalTeams,uniqueLocalAssets:icons.size,externalRuntimeAssets:0},quality};
await fs.writeFile(path.join(root,'data/consumption-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({coverage:manifest.coverage,quality},null,2));
