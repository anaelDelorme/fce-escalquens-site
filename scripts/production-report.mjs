import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const report={commit:process.env.GITHUB_SHA,preparation:process.env.PREPARATION_OUTCOME||'unknown',pr:process.env.PR_OUTCOME||'unknown',pr_url:process.env.PR_URL||null,run_url:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,production_writes:0};
try{report.production_databases=JSON.parse(readFileSync('.production-preparation/discovered-bindings.json','utf8'));}catch{}
if(report.preparation==='failure'){
 const error=(()=>{try{return readFileSync('preparation-error.txt','utf8');}catch{return '';}})();
 const known=['Lecture Cloudflare impossible','Migration source absente','Clé média invalide','Fournisseur source absent','Catégorie source absente','Personnalisation source absente','Équipe de tournoi sans correspondance production','Identifiant de choix déjà utilisé','Nom de base production ambigu','La migration des personnalisations obligatoires manque'];
 report.preparation_reason=known.find(message=>error.includes(message))||'preparation_command_failed';
 const operation=error.match(/operation=([a-z-]+),env=([a-z-]+),resource=([A-Z-]+)/);
 if(operation)report.failed_operation={operation:operation[1],environment:operation[2],resource:operation[3]};
 const table=error.match(/Migration source absente : ([a-z_]+)/);if(table)report.missing_table=table[1];
}
if(report.pr==='failure'){
 const error=(()=>{try{return readFileSync('pr-error.txt','utf8');}catch{return '';}})();
 report.pr_reason=error.includes('not permitted to create or approve pull requests')?'actions_pr_creation_disabled':'pr_command_failed';
}
try{
 const manifest=JSON.parse(readFileSync(`.production-preparation/preparation-${process.env.GITHUB_RUN_ID}/manifest.json`,'utf8'));
 report.counts=manifest.counts;report.sql_sha256=manifest.sql_sha256;
}catch{ /* Missing manifest means exports did not complete. No rows are logged. */ }
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
