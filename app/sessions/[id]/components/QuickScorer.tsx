"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type Player = { player_id: string; players: { name: string } | null };
type Match = { id: string; match_number: number; team_a: string | null; team_b: string | null; overs: number | null; match_status?: string | null; batting_first_side?: string | null; current_innings?: number | null };
type Ball = { id: string; match_id: string; innings: number; ball_index: number; bowler_name: string; striker_name: string | null; runs_bat: number; extra_type: string | null; extra_runs: number; wicket: boolean; created_at: string };
type Side = "A" | "B";
const adminEmail = "kashifanisahmedbaksh3@gmail.com";
const cls = "rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-white";
const btn = "rounded-xl bg-slate-700 px-4 py-3 font-bold disabled:opacity-40";
function total(b: Ball[]) { return b.reduce((n,x) => n + x.runs_bat + x.extra_runs, 0); }
function legal(b: Ball[]) { return b.filter(x => !x.extra_type).length; }
function overs(b: Ball[]) { const n=legal(b); return `${Math.floor(n/6)}.${n%6}`; }
function wickets(b: Ball[]) { return b.filter(x=>x.wicket).length; }
function playerSelectOptions(names: string[]) { return names.map(n=><option key={n} value={n}>{n}</option>); }

export default function QuickScorer({match, sessionPlayers, captainA, captainB, onChanged}: {match: Match; sessionPlayers: Player[]; captainA?: string | null; captainB?: string | null; onChanged?: ()=>void | Promise<void>}) {
  const [isAdmin,setIsAdmin]=useState(false);
  const [balls,setBalls]=useState<Ball[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [innings,setInnings]=useState(match.current_innings === 2 ? 2 : 1);
  const [firstSide,setFirstSide]=useState<Side>(match.batting_first_side === "B" ? "B":"A");
  const [bowler,setBowler]=useState("");
  const [striker,setStriker]=useState("");
  const [guest,setGuest]=useState("");
  const [guests,setGuests]=useState<string[]>([]);
  const [extra,setExtra]=useState<"wide"|"no_ball"|null>(null);
  const [extraRuns,setExtraRuns]=useState(1);
  const [inningsOneEnded,setInningsOneEnded]=useState(match.current_innings === 2);
  const [finished,setFinished]=useState(match.match_status === "completed");
  const [overReport,setOverReport]=useState("");
  const names=useMemo(()=>Array.from(new Set([...sessionPlayers.map(p=>p.players?.name?.trim()||"").filter(Boolean),...guests])).sort(),[sessionPlayers,guests]);
  const refresh=useCallback(async()=>{
    const {data,error:e}=await supabase.from("match_quick_balls").select("*").eq("match_id",match.id).order("ball_index",{ascending:true});
    if(e) setError(e.message); else {setBalls((data||[]) as Ball[]);setError("");}
  },[match.id]);
  useEffect(()=>{supabase.auth.getUser().then(({data})=>setIsAdmin(data.user?.email?.toLowerCase()===adminEmail));refresh();},[refresh]);
  useEffect(()=>{setFinished(match.match_status === "completed");},[match.match_status]);
  useEffect(()=>{const found=balls.filter(b=>b.innings===2);if(found.length){setInnings(2);setInningsOneEnded(true);} const used=balls.flatMap(b=>[b.bowler_name,b.striker_name||""]).filter(Boolean);setGuests(g=>Array.from(new Set([...g,...used.filter(n=>!sessionPlayers.some(p=>p.players?.name===n))])));},[balls,sessionPlayers]);
  const current=balls.filter(b=>b.innings===innings);
  const first=balls.filter(b=>b.innings===1);
  const second=balls.filter(b=>b.innings===2);
  const battingSide:Side=innings===1?firstSide:firstSide==="A"?"B":"A";
  const bowlingSide:Side=battingSide==="A"?"B":"A";
  const team=(side:Side)=>side==="A"?(match.team_a||"Team A"):(match.team_b||"Team B");
  const score=total(current);
  const legalBalls=legal(current);
  const limit=Math.max(1,Number(match.overs)||7)*6;
  const target=total(first)+1;
  const reached=innings===2&&score>=target;
  const inningsLimit=legalBalls>=limit;
    async function saveBall(runs:number,wicket=false){
    if(!isAdmin||busy||finished||inningsLimit||reached||inningsOneEnded&&innings===1)return;
    if(!bowler.trim()){alert("Choose or enter a bowler first.");return;}
    if(!striker.trim()){alert("Choose or enter the batter first.");return;}
    if(extra&&wicket){alert("Record wicket separately; wicket on extras needs a special dismissal type.");return;}
    const row={match_id:match.id,innings,ball_index:(balls.at(-1)?.ball_index||0)+1,bowler_name:bowler.trim(),striker_name:striker.trim(),runs_bat:extra==="wide"?0:runs,extra_type:extra,extra_runs:extra?extraRuns:0,wicket};
    setBusy(true);
    const {error:e}=await supabase.from("match_quick_balls").insert(row);
    if(e){alert(e.message);setBusy(false);return;}
    const next=[...current,{...row,id:"temp",created_at:""} as Ball];
    const side=battingSide;
    // Persist batting order immediately. Otherwise a page refresh in the first innings
    // can incorrectly switch batting first back to Team A.
    const update:any={match_status:"in_progress",current_innings:innings,batting_first_side:firstSide,batting_first_team:team(firstSide)};
    update[side==="A"?"team_a_runs":"team_b_runs"]=total(next);
    update[side==="A"?"team_a_wickets":"team_b_wickets"]=wickets(next);
    await supabase.from("matches").update(update).eq("id",match.id);
    if(!extra&&legal(next)%6===0){const last=next.slice().reverse();let legalCount=0;const over:Ball[]=[];for(const b of last){over.unshift(b);if(!b.extra_type)legalCount++;if(legalCount===6)break;}setOverReport(`Over ${legal(next)/6}: ${total(over)} runs, ${wickets(over)} wicket(s). Bowler: ${bowler}`);setBowler("");}
    setExtra(null);setExtraRuns(1);await refresh();await onChanged?.();setBusy(false);
  }
  async function undo(){if(!isAdmin||busy||!balls.length||finished)return;const last=balls.at(-1)!;if(!confirm("Undo last delivery?"))return;setBusy(true);const {error:e}=await supabase.from("match_quick_balls").delete().eq("id",last.id);if(e){alert(e.message);setBusy(false);return;}const remaining=balls.filter(b=>b.id!==last.id).filter(b=>b.innings===last.innings);const side=last.innings===1?firstSide:firstSide==="A"?"B":"A";await supabase.from("matches").update({[side==="A"?"team_a_runs":"team_b_runs"]:total(remaining),[side==="A"?"team_a_wickets":"team_b_wickets"]:wickets(remaining)}).eq("id",match.id);setOverReport("");await refresh();await onChanged?.();setBusy(false);}
  async function endInnings(){if(!isAdmin||busy||finished)return;if(innings===1){if(!current.length){alert("Record at least one ball first.");return;}if(!confirm(`End first innings at ${score}/${wickets(current)}?`))return;setInningsOneEnded(true);setInnings(2);setBowler("");setStriker("");setOverReport("");const {error:e}=await supabase.from("matches").update({current_innings:2,target_runs:target,batting_first_side:firstSide,batting_first_team:team(firstSide),match_status:"in_progress"}).eq("id",match.id);if(e)alert(e.message);await onChanged?.();}else await finishMatch();}
  async function finishMatch(){if(!isAdmin||busy||finished)return;if(!second.length){alert("Score the second innings before finishing.");return;}const firstScore=total(first),secondScore=total(second);const winner=secondScore>firstScore?team(firstSide==="A"?"B":"A"):firstScore>secondScore?team(firstSide):"Draw";const result=winner==="Draw"?"Match tied":`${winner} won`;
    if(!confirm(`Finish match? ${team(firstSide)} ${firstScore}, ${team(firstSide==="A"?"B":"A")} ${secondScore}. Result: ${result}`))return;
    setBusy(true);const {error:e}=await supabase.from("matches").update({winner,match_status:"completed",result_text:result,completed_at:new Date().toISOString(),current_innings:2,target_runs:firstScore+1,batting_first_side:firstSide,batting_first_team:team(firstSide)}).eq("id",match.id);if(e)alert(e.message);else{setFinished(true);await onChanged?.();}setBusy(false);
  }
  function addGuest(){const n=guest.trim();if(!n)return;setGuests(v=>v.includes(n)?v:[...v,n]);setGuest("");}
  const bowlingSummary=useMemo(()=>{const m=new Map<string,{runs:number;wickets:number;balls:number}>();for(const b of current){const x=m.get(b.bowler_name)||{runs:0,wickets:0,balls:0};x.runs+=b.runs_bat+b.extra_runs;x.wickets+=Number(b.wicket);x.balls+=Number(!b.extra_type);m.set(b.bowler_name,x);}return [...m.entries()];},[current]);
  return <section className="mt-5 rounded-2xl border border-cyan-700 bg-slate-950 p-4 text-white sm:p-6">
    <h4 className="text-xl font-black">⚡ Quick Scorer — Match {match.match_number}</h4>
    <p className="mt-1 text-sm text-slate-400">One tap per ball • Session players or guest names • Automatic totals</p>
    {error&&<p className="mt-3 rounded bg-red-900 p-3 text-red-200">{error} — Run the supplied SQL setup first.</p>}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <span className="rounded-lg bg-blue-900 px-3 py-2 font-bold">{team("A")}</span><span>VS</span><span className="rounded-lg bg-red-900 px-3 py-2 font-bold">{team("B")}</span>
      {finished&&<span className="rounded bg-green-800 px-3 py-2">Completed</span>}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-slate-900 p-4"><p className="text-sm text-slate-400">1st innings · {team(firstSide)}</p><p className="text-3xl font-black">{total(first)}/{wickets(first)}</p><p>{overs(first)} overs</p></div>
      <div className="rounded-xl bg-slate-900 p-4"><p className="text-sm text-slate-400">2nd innings · {team(firstSide==="A"?"B":"A")}</p><p className="text-3xl font-black">{total(second)}/{wickets(second)}</p><p>{overs(second)} overs {innings===2&&`· Target ${target}`}</p></div>
    </div>
    {balls.length===0&&<label className="mt-4 block text-sm">Batting first <select className={`${cls} ml-2`} value={firstSide} onChange={e=>setFirstSide(e.target.value as Side)} disabled={!isAdmin}><option value="A">{team("A")}</option><option value="B">{team("B")}</option></select></label>}
    <div className="mt-4 rounded-xl bg-slate-900 p-4"><p className="font-bold">Innings {innings} · Batting: {team(battingSide)} · Bowling: {team(bowlingSide)}</p><p className="mt-1 text-2xl font-black">{score}/{wickets(current)} <span className="text-base font-normal">({overs(current)} / {match.overs||7} overs)</span></p>{reached&&<p className="text-green-300">Target reached — finish the match.</p>}{inningsLimit&&<p className="text-yellow-300">Over limit reached — end innings.</p>}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Bowler<select className={`mt-1 block w-full ${cls}`} value={bowler} onChange={e=>setBowler(e.target.value)} disabled={!isAdmin||finished}><option value="">Select bowler</option>{playerSelectOptions(names)}</select></label>
      <label className="text-sm">Batter (striker)<select className={`mt-1 block w-full ${cls}`} value={striker} onChange={e=>setStriker(e.target.value)} disabled={!isAdmin||finished}><option value="">Select batter</option>{playerSelectOptions(names)}</select></label>
    </div>
    <div className="mt-3 flex gap-2"><input className={`min-w-0 flex-1 ${cls}`} value={guest} onChange={e=>setGuest(e.target.value)} placeholder="Guest / replacement captain / player name" disabled={!isAdmin}/><button className={btn} onClick={addGuest} disabled={!isAdmin}>Add name</button></div>
    <p className="mt-2 text-xs text-slate-400">Session captains: {captainA||team("A")} / {captainB||team("B")}. For a replacement, enter the name above and select them as batter or bowler. Session captain records stay unchanged.</p>
    {!finished&&<>
      <div className="mt-5 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={extra==="wide"} onChange={e=>setExtra(e.target.checked?"wide":null)}/> Wide</label><label className="flex items-center gap-2"><input type="checkbox" checked={extra==="no_ball"} onChange={e=>setExtra(e.target.checked?"no_ball":null)}/> No ball</label>{extra&&<label className="text-sm">Extra runs <select className={`${cls} ml-2`} value={extraRuns} onChange={e=>setExtraRuns(Number(e.target.value))}>{[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n}</option>)}</select></label>}</div>
      <p className="mt-2 text-sm text-slate-400">{extra?`Each tap adds ${extraRuns} extra run(s) plus any bat runs; this is not a legal ball.`:"Tap the runs scored on the delivery."}</p>
      <div className="mt-3 grid grid-cols-4 gap-2">{[0,1,2,3,4,6].map(n=><button key={n} className={`${btn} bg-cyan-800 text-xl`} disabled={!isAdmin||busy||inningsLimit||reached} onClick={()=>saveBall(n)}>{n}</button>)}<button className={`${btn} col-span-2 bg-red-800`} disabled={!isAdmin||busy||!!extra||inningsLimit||reached} onClick={()=>saveBall(0,true)}>WICKET</button></div>
      <div className="mt-3 flex flex-wrap gap-2"><button className={btn} disabled={!isAdmin||busy||!balls.length} onClick={undo}>↶ Undo last ball</button><button className={`${btn} bg-amber-700`} disabled={!isAdmin||busy||!current.length} onClick={endInnings}>{innings===1?"End 1st Innings":"Finish Match"}</button></div>
    </>}
    {overReport&&<p className="mt-4 rounded-xl bg-green-950 p-3 font-bold">{overReport}</p>}
    <h5 className="mt-5 font-bold">Bowling summary — innings {innings}</h5>
    <div className="mt-2 space-y-2">{bowlingSummary.map(([name,v])=><div key={name} className="flex justify-between rounded bg-slate-900 p-3"><span>{name}</span><span>{Math.floor(v.balls/6)}.{v.balls%6} overs · {v.runs} runs · {v.wickets} wickets</span></div>)}{!bowlingSummary.length&&<p className="text-sm text-slate-400">No deliveries yet.</p>}</div>
    <p className="mt-4 text-sm text-slate-400">Last deliveries: {current.slice(-12).map(b=>`${b.wicket?"W":b.runs_bat+b.extra_runs}${b.extra_type?` ${b.extra_type}`:""}`).join(" · ")||"—"}</p>
    <p className="mt-3 text-xs text-amber-300">Quick mode: basic wickets and extras. Run-outs, byes, leg-byes, strike rotation and detailed dismissal attribution are not yet supported. Use the correct innings-end action when play stops.</p>
  </section>;
}
