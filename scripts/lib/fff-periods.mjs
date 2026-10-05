const CLUB_NO='101544',DISTRICT_NO='86';
const parisDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'});
const offsetFormat=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Paris',timeZoneName:'longOffset'});
export function parisDay(date){return parisDate.format(date);}
function boundary(day,end=false){
  // An offset at UTC midnight gives the local start offset, even on DST change days.
  const instant=new Date(`${day}T${end?'22:00':'00:00'}:00Z`);
  const offset=offsetFormat.formatToParts(instant).find(part=>part.type==='timeZoneName').value.replace('GMT','');
  return `${day}T${end?'23:59:59':'00:00:00'}${offset}`;
}
export function makeTargets(now=new Date()){
  const today=parisDay(now),year=Number(today.slice(0,4)),month=Number(today.slice(5,7));
  const seasonYear=month>=7?year:year-1;
  const range=(start,end)=>({
    matches:'https://epreuves.fff.fr/api/data/matches?'+new URLSearchParams({dateDebut:boundary(start),dateFin:boundary(end,true),clNo:CLUB_NO,itemsPerPage:'100',pagination:'true'}),
    fal:`https://epreuves.fff.fr/api/fal/cdg/${DISTRICT_NO}/club/${CLUB_NO}/sites?`+new URLSearchParams({dateDebut:start,dateFin:end})
  });
  const months=Array.from({length:12},(_,i)=>range(new Date(Date.UTC(seasonYear,6+i,1)).toISOString().slice(0,10),new Date(Date.UTC(seasonYear,7+i,0)).toISOString().slice(0,10)));
  const lower=new Date(Date.UTC(seasonYear,6,3,12)).getTime(),upper=new Date(Date.UTC(seasonYear+1,5,23,12)).getTime();
  const reference=new Date(Math.max(lower,Math.min(upper,new Date(`${today}T12:00:00Z`).getTime())));
  const days=Array.from({length:10},(_,i)=>{
    const day=new Date(reference.getTime()+(i-2)*86400000).toISOString().slice(0,10);
    return {day,...range(day,day)};
  });
  return {seasonYear,matches:months.map(m=>m.matches),fal:months.map(m=>m.fal),days};
}
