import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const report={commit:process.env.GITHUB_SHA,preparation:process.env.PREPARATION_OUTCOME||'unknown',pr:process.env.PR_OUTCOME||'unknown',pr_url:process.env.PR_URL||null,run_url:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,production_writes:0};
report.artifact=process.env.ARTIFACT_OUTCOME||'unknown';report.artifact_url=process.env.ARTIFACT_URL||null;
report.archive_encrypted=process.env.ARCHIVE_ENCRYPTED==='true';
if(process.env.CLEANUP_OUTCOME)report.legacy_artifact_cleanup=process.env.CLEANUP_OUTCOME;
try{report.legacy_preparation_artifacts_removed=JSON.parse(readFileSync('.production-preparation/legacy-artifact-cleanup.json','utf8')).legacy_preparation_artifacts_removed;}catch{}
if(process.env.PRODUCTION_OPERATION){
 report.operation=process.env.PRODUCTION_OPERATION;report.operation_outcome=process.env.APPLY_OUTCOME||'skipped';
 report.backup_artifact_url=process.env.BACKUP_ARTIFACT_URL||null;
 report.backup_encrypted=process.env.BACKUP_ARCHIVE_ENCRYPTED==='true';
 // A failed write may have applied some statements. Never report zero writes
 // once the mutation step has started, and do not invent an exact count.
 if(['success','failure','cancelled'].includes(report.operation_outcome))delete report.production_writes;
 report.production_write_step_started=['success','failure','cancelled'].includes(report.operation_outcome);
}
try{report.production_databases=JSON.parse(readFileSync('.production-preparation/discovered-bindings.json','utf8'));}catch{}
try{report.production_secret_presence=JSON.parse(readFileSync('.production-preparation/production-secret-presence.json','utf8'));}catch{}
if(report.preparation==='failure'){
 const error=(()=>{try{return readFileSync('preparation-error.txt','utf8');}catch{return '';}})();
 const known=['Lecture Cloudflare impossible','Média public staging inaccessible','Migration source absente','Clé média invalide','Fournisseur source absent','Catégorie source absente','Personnalisation source absente','Équipe de tournoi sans correspondance production','Lieu du tournoi sans correspondance production','Saison du tournoi sans correspondance production','Identifiant de choix déjà utilisé','Nom de base production ambigu','La migration des personnalisations obligatoires manque'];
 report.preparation_reason=error.includes('PRODUCTION_ARCHIVE_PASSWORD trop court')?'archive_key_too_short':/PRODUCTION_ARCHIVE_PASSWORD (absent|requis)/.test(error)?'archive_key_missing':known.find(message=>error.includes(message))||'preparation_command_failed';
 const operation=error.match(/operation=([a-z0-9-]+),env=([a-z-]+),resource=([A-Z-]+)/);
 if(operation)report.failed_operation={operation:operation[1],environment:operation[2],resource:operation[3]};
 const code=error.match(/code=([a-z0-9]+),hint=([a-z-]+)/);if(code)report.cloudflare_failure={code:code[1],hint:code[2]};
 const table=error.match(/Migration source absente : ([a-z_]+)/);if(table)report.missing_table=table[1];
}
if(report.pr==='failure'){
 const error=(()=>{try{return readFileSync('pr-error.txt','utf8');}catch{return '';}})();
 report.pr_reason=error.includes('not permitted to create or approve pull requests')?'actions_pr_creation_disabled':'pr_command_failed';
}
try{
 const bytes=readFileSync(`.production-preparation/preparation-${process.env.GITHUB_RUN_ID}/manifest.json`);
 const manifest=JSON.parse(bytes);
 report.manifest_sha256=createHash('sha256').update(bytes).digest('hex');
 report.counts=manifest.counts;report.sql_sha256=manifest.sql_sha256;report.business_contact_present=manifest.business_contact_present;
 report.production_tournaments_initialized=manifest.production_tournaments_initialized;
 report.production_tournament_snapshot_from=manifest.production_tournament_snapshot_from;
}catch{ /* Missing manifest means exports did not complete. No rows are logged. */ }
if(process.env.PRODUCTION_OPERATION){try{
 const result=JSON.parse(readFileSync(`.production-maintenance/${process.env.GITHUB_RUN_ID}/result.json`,'utf8'));
 for(const field of ['initialized','imported','sales_closed','counts','manifest_sha256'])if(Object.hasOwn(result,field))report[field]=result[field];
}catch{}}
if(!report.counts){try{
 const source=JSON.parse(readFileSync(`.production-preparation/preparation-${process.env.GITHUB_RUN_ID}/source.json`,'utf8'));
 report.database_exports={articles:source.shop.shop_products.length,tournaments:source.tournaments.tournaments.length};
}catch{}}
function git(args,input){
 const result=spawnSync('git',args,{encoding:'utf8',input,env:{...process.env,GIT_AUTHOR_NAME:'github-actions[bot]',GIT_AUTHOR_EMAIL:'41898282+github-actions[bot]@users.noreply.github.com',GIT_COMMITTER_NAME:'github-actions[bot]',GIT_COMMITTER_EMAIL:'41898282+github-actions[bot]@users.noreply.github.com'}});
 if(result.status!==0)throw Error('Impossible de publier le compte rendu de préparation.');
 return result.stdout.trim();
}
const ref='refs/heads/release/production-preparation-report';
const remote=git(['ls-remote','--heads','origin',ref]);
let parent=null;if(remote){git(['fetch','origin',ref]);parent=git(['rev-parse','FETCH_HEAD']);}
const blob=git(['hash-object','-w','--stdin'],JSON.stringify(report,null,2)+'\n');
const tree=git(['mktree'],`100644 blob ${blob}\tstatus.json\n`);
const commit=git(['commit-tree',tree,...(parent?['-p',parent]:[]),'-m',`Préparation production ${process.env.GITHUB_RUN_ID}`]);
git(['push','origin',`${commit}:${ref}`]);
console.log(JSON.stringify(report));
