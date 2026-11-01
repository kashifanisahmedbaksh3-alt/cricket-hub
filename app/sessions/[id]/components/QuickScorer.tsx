"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type Player = { player_id: string; players: { name: string } | null };
type TeamAssignment = { player_id: string; team_side: "A" | "B" };
type Match = { id: string; match_number: number; team_a: string | null; team_b: string | null; overs: number | null; match_status?: string | null; batting_first_side?: string | null; current_innings?: number | null };
type Ball = { id: string; match_id: string; innings: number; ball_index: number; bowler_name: string; striker_name: string | null; non_striker_name?: string | null; runs_bat: number; extra_type: string | null; extra_runs: number; wicket: boolean; created_at: string };
type Side = "A" | "B";
const adminEmail = "kashifanisahmedbaksh3@gmail.com";
const cls = "rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-white";
const btn = "rounded-xl bg-slate-700 px-4 py-3 font-bold disabled:opacity-40";
function total(b: Ball[]) { return b.reduce((n,x) => n + x.runs_bat + x.extra_runs, 0); }
function legal(b: Ball[]) { return b.filter(x => !x.extra_type).length; }
function overs(b: Ball[]) { const n=legal(b); return `${Math.floor(n/6)}.${n%6}`; }
function wickets(b: Ball[]) { return b.filter(x=>x.wicket).length; }
function playerSelectOptions(names: string[]) { return names.map(n=><option key={n} value={n}>{n}</option>); }

export default function QuickScorer({match, sessionPlayers, teamAssignments = [], captainA, captainB, onChanged}: {match: Match; sessionPlayers: Player[]; teamAssignments?: TeamAssignment[]; captainA?: string | null; captainB?: string | null; onChanged?: ()=>void | Promise<void>}) {
  const [isAdmin,setIsAdmin]=useState(false);
  const [balls,setBalls]=useState<Ball[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [innings,setInnings]=useState(match.current_innings === 2 ? 2 : 1);
  const [firstSide,setFirstSide]=useState<Side>(match.batting_first_side === "B" ? "B":"A");
  const [bowler,setBowler]=useState("");
  const [striker,setStriker]=useState("Player 1");
  const [nonStriker,setNonStriker]=useState("Player 2");
  const [guests,setGuests]=useState<string[]>([]);
  const [manualBowler,setManualBowler]=useState("");
  const [showManualBowler,setShowManualBowler]=useState(false);
  const [inningsOneEnded,setInningsOneEnded]=useState(match.current_innings === 2);
  const [finished,setFinished]=useState(match.match_status === "completed");
  const [overReport,setOverReport]=useState("");
  // Batters are tracked anonymously for score-history compatibility. No batter selection is shown.
  const refresh=useCallback(async()=>{
    const {data,error:e}=await supabase.from("match_quick_balls").select("*").eq("match_id",match.id).order("ball_index",{ascending:true});
    if(e) setError(e.message); else {setBalls((data||[]) as Ball[]);setError("");}
  },[match.id]);
  useEffect(()=>{supabase.auth.getUser().then(({data})=>setIsAdmin(data.user?.email?.toLowerCase()===adminEmail));refresh();},[refresh]);
  useEffect(()=>{setFinished(match.match_status === "completed");},[match.match_status]);
  useEffect(()=>{
    const found=balls.filter(b=>b.innings===2);
    if(found.length){setInnings(2);setInningsOneEnded(true);}
    const used=balls.map(b=>b.bowler_name).filter(Boolean);
    setGuests(g=>{
      const additional=used.filter(n=>!sessionPlayers.some(p=>p.players?.name===n) && !g.includes(n));
      return additional.length ? [...g,...new Set(additional)] : g;
    });
    // If this page was refreshed halfway through an over, restore the same bowler.
    // Never overwrite a bowler the scorer has already selected manually.
    const activeInnings=found.length ? 2 : innings;
    const recorded=balls.filter(b=>b.innings===activeInnings);
    const count=legal(recorded);
    if(recorded.length && count%6!==0){setBowler(previous=>previous||recorded[recorded.length-1].bowler_name);}
  },[balls,sessionPlayers,innings]);
  // Reconstruct both batting positions from the most recent recorded delivery.
  // This restores the correct pair after a refresh or when Undo is used.
  useEffect(()=>{
    const recorded=balls.filter(b=>b.innings===innings);
    const last=recorded.at(-1);
    if(!last){setStriker("Player 1");setNonStriker("Player 2");return;}
    let batting=last.striker_name?.trim()||"Player 1";
    let partner=last.non_striker_name?.trim()||"Player 2";
    if(last.wicket){
      const dismissed=recorded.filter(b=>b.wicket).length;
      batting=`Player ${dismissed+2}`;
    } else {
      // Wides may include extra runs taken; no-ball bat runs can rotate strike.
      const running=last.extra_type==="wide"?Math.max(0,last.extra_runs-1):last.runs_bat;
      if(running%2===1){[batting,partner]=[partner,batting];}
    }
    // At the end of a completed over, the batting ends change.
    const legalCount=legal(recorded);
    if(!last.extra_type&&legalCount>0&&legalCount%6===0){
      [batting,partner]=[partner,batting];
    }
    setStriker(batting);
    setNonStriker(partner);
  },[balls,innings]);
  const current=balls.filter(b=>b.innings===innings);
  const first=balls.filter(b=>b.innings===1);
  const second=balls.filter(b=>b.innings===2);
  const battingSide:Side=innings===1?firstSide:firstSide==="A"?"B":"A";
  const bowlingSide:Side=battingSide==="A"?"B":"A";
  const bowlingGroups = useMemo(() => {
    const assignments = new Map(teamAssignments.map(a => [a.player_id, a.team_side]));
    const assigned: string[] = [];
    const unassigned: string[] = [];
    for (const entry of sessionPlayers) {
      const name = entry.players?.name?.trim();
      if (!name) continue;
      const side = assignments.get(entry.player_id);
      if (side === bowlingSide) assigned.push(name);
      else if (!side) unassigned.push(name);
      // Players assigned to the batting side are intentionally excluded.
    }
    const unique = (values: string[]) => Array.from(new Set(values)).sort((a,b) => a.localeCompare(b));
    const manual = unique([...guests, ...(bowler ? [bowler] : [])].filter(n =>
      !assigned.includes(n) && !unassigned.includes(n)
    ));
    return { assigned: unique(assigned), unassigned: unique(unassigned), manual };
  }, [sessionPlayers, teamAssignments, bowlingSide, guests, bowler]);
  const team=(side:Side)=>side==="A"?(match.team_a||"Team A"):(match.team_b||"Team B");
  const score=total(current);
  const legalBalls=legal(current);
  const limit=Math.max(1,Number(match.overs)||7)*6;
  const target=total(first)+1;
  const reached=innings===2&&score>=target;
  const inningsLimit=legalBalls>=limit;
  async function saveBall(runs:number, kind:"normal"|"wide"|"no_ball"="normal", wicket=false){
    if(!isAdmin||busy||finished||inningsLimit||reached||(inningsOneEnded&&innings===1))return;
    if(!bowler.trim()){setError("Select a bowler before recording the next delivery.");return;}
    if(!striker.trim()||!nonStriker.trim()||striker===nonStriker){
      setError("Striker and non-striker must differ. Player 1 and Player 2 work without real names.");return;
    }
    if(kind!=="normal" && wicket)return;
    // A wide is 1 penalty + additional wide runs; a no-ball is 1 penalty + bat runs.
    // Neither consumes one of the six legal deliveries.
    const row={
      match_id:match.id, innings,
      ball_index:(balls.at(-1)?.ball_index||0)+1,
      bowler_name:bowler.trim(), striker_name:striker.trim(), non_striker_name:nonStriker.trim(),
      runs_bat:kind==="wide"?0:runs,
      extra_type:kind==="normal"?null:kind,
      extra_runs:kind==="normal"?0:1+(kind==="wide"?runs:0),
      wicket,
    };
    setError("");setBusy(true);
    // Get the inserted row instead of re-fetching every ball. This makes the UI much faster.
    const {data:inserted,error:e}=await supabase.from("match_quick_balls").insert(row).select("*").single();
    if(e||!inserted){setError(e?.message||"Could not save the delivery. Try again.");setBusy(false);return;}
    const saved=inserted as Ball;
    const next=[...current,saved];
    setBalls(previous=>[...previous,saved]);
    const update:Record<string,unknown>={match_status:"in_progress",current_innings:innings,
      batting_first_side:firstSide,batting_first_team:team(firstSide)};
    update[battingSide==="A"?"team_a_runs":"team_b_runs"]=total(next);
    update[battingSide==="A"?"team_a_wickets":"team_b_wickets"]=wickets(next);
    const {error:scoreError}=await supabase.from("matches").update(update).eq("id",match.id);
    if(scoreError)setError(`Ball saved, but match total did not update: ${scoreError.message}`);
    const overComplete=kind==="normal"&&legal(next)%6===0;
    if(overComplete){
      // Include wides/no-balls at the start of the over, before its first legal ball.
      const priorLegalBalls = legal(next) - 6;
      let seenLegalBalls = 0;
      const over = next.filter(b => {
        const beforeThisBall = seenLegalBalls;
        if (!b.extra_type) seenLegalBalls += 1;
        return beforeThisBall >= priorLegalBalls;
      });
      const overNo=legal(next)/6;
      const end=legal(next)>=limit;
      setOverReport(`Over ${overNo} complete · ${total(over)} runs · ${wickets(over)} wicket(s). ${end?"End the innings.":"Select the next bowler."}`);
      setBowler("");
    } else setOverReport("");
    // Do not call the parent's session reload after each delivery: it causes slow taps.
    setBusy(false);
  }
  async function undo(){if(!isAdmin||busy||!balls.length||finished)return;const last=balls.at(-1)!;if(!confirm("Undo last delivery?"))return;setBusy(true);const {error:e}=await supabase.from("match_quick_balls").delete().eq("id",last.id);if(e){alert(e.message);setBusy(false);return;}const remaining=balls.filter(b=>b.id!==last.id).filter(b=>b.innings===last.innings);const side=last.innings===1?firstSide:firstSide==="A"?"B":"A";await supabase.from("matches").update({[side==="A"?"team_a_runs":"team_b_runs"]:total(remaining),[side==="A"?"team_a_wickets":"team_b_wickets"]:wickets(remaining)}).eq("id",match.id);setOverReport("");await refresh();await onChanged?.();setBusy(false);}
  async function endInnings(){if(!isAdmin||busy||finished)return;if(innings===1){if(!current.length){alert("Record at least one ball first.");return;}if(!confirm(`End first innings at ${score}/${wickets(current)}?`))return;setInningsOneEnded(true);setInnings(2);setBowler("");setStriker("Player 1");setNonStriker("Player 2");setOverReport("");const {error:e}=await supabase.from("matches").update({current_innings:2,target_runs:target,batting_first_side:firstSide,batting_first_team:team(firstSide),match_status:"in_progress"}).eq("id",match.id);if(e)alert(e.message);await onChanged?.();}else await finishMatch();}
  async function finishMatch(){if(!isAdmin||busy||finished)return;if(!second.length){alert("Score the second innings before finishing.");return;}const firstScore=total(first),secondScore=total(second);const winner=secondScore>firstScore?team(firstSide==="A"?"B":"A"):firstScore>secondScore?team(firstSide):"Draw";const result=winner==="Draw"?"Match tied":`${winner} won`;
    if(!confirm(`Finish match? ${team(firstSide)} ${firstScore}, ${team(firstSide==="A"?"B":"A")} ${secondScore}. Result: ${result}`))return;
    setBusy(true);const {error:e}=await supabase.from("matches").update({winner,match_status:"completed",result_text:result,completed_at:new Date().toISOString(),current_innings:2,target_runs:firstScore+1,batting_first_side:firstSide,batting_first_team:team(firstSide)}).eq("id",match.id);if(e)alert(e.message);else{setFinished(true);await onChanged?.();}setBusy(false);
  }
  function useManualBowler(){
    const name=manualBowler.trim();
    if(!name)return;
    setGuests(v=>v.includes(name)?v:[...v,name]);
    setBowler(name);
    setManualBowler("");
    setShowManualBowler(false);
    setError("");
  }
  const bowlingSummary=useMemo(()=>{const m=new Map<string,{runs:number;wickets:number;balls:number}>();for(const b of current){const x=m.get(b.bowler_name)||{runs:0,wickets:0,balls:0};x.runs+=b.runs_bat+b.extra_runs;x.wickets+=Number(b.wicket);x.balls+=Number(!b.extra_type);m.set(b.bowler_name,x);}return [...m.entries()];},[current]);
  const disabledScoring=!isAdmin||busy||finished||!bowler||inningsLimit||reached||(inningsOneEnded&&innings===1);
  const keyButton="min-h-14 touch-manipulation select-none rounded-xl px-2 py-3 text-xl font-extrabold shadow-sm active:scale-[0.97] disabled:opacity-40";
  return <section className="mt-3 rounded-2xl border border-cyan-700 bg-slate-950 p-3 text-white sm:p-6">
    <header className="sticky top-0 z-20 -mx-3 border-b border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-slate-400">⚡ Match {match.match_number} · Innings {innings} · {team(battingSide)} batting</p>
          <p className="text-2xl font-black tabular-nums">{score}/{wickets(current)} <span className="text-sm font-medium text-slate-300">({overs(current)} / {match.overs||7})</span></p>
        </div>
        <div className="shrink-0 text-right text-xs text-slate-300">
          <p>{team(bowlingSide)} bowling</p>
          {innings===2&&<p className="font-bold text-green-300">Target {target}</p>}
          {busy&&<p role="status" className="text-amber-300">Saving…</p>}
        </div>
      </div>
    </header>

    {error&&<p role="alert" className="mt-3 rounded-xl border border-red-600 bg-red-950 p-3 text-sm text-red-100">{error}</p>}
    {finished&&<p className="mt-3 rounded-xl bg-green-950 p-3 font-bold">Match completed</p>}
    {balls.length===0&&<label className="mt-3 block text-sm font-semibold">Batting first
      <select className={`mt-1 block w-full ${cls}`} value={firstSide} onChange={e=>setFirstSide(e.target.value as Side)} disabled={!isAdmin}>
        <option value="A">{team("A")}</option><option value="B">{team("B")}</option>
      </select>
    </label>}

    <div className="mt-3">
      <label htmlFor={`bowler-${match.id}`} className="block text-sm font-bold">🎯 Bowler <span className="font-normal text-slate-400">(select once for 6 legal balls)</span></label>
      <div className="mt-1 flex gap-2">
        <select id={`bowler-${match.id}`} className={`min-w-0 flex-1 ${cls}`} value={bowler}
          onChange={e=>{setBowler(e.target.value);setError("");}}
          disabled={!isAdmin||finished}>
          <option value="">Select bowler</option>
          {bowlingGroups.assigned.length > 0 &&
            <optgroup label={`${team(bowlingSide)} — bowling team`}>
              {playerSelectOptions(bowlingGroups.assigned)}
            </optgroup>}
          {bowlingGroups.unassigned.length > 0 &&
            <optgroup label={bowlingGroups.assigned.length ? "Not assigned to a team" : "Session players"}>
              {playerSelectOptions(bowlingGroups.unassigned)}
            </optgroup>}
          {bowlingGroups.manual.length > 0 &&
            <optgroup label="Manually entered bowlers">
              {playerSelectOptions(bowlingGroups.manual)}
            </optgroup>}
        </select>
        <button type="button" className="shrink-0 rounded-xl bg-slate-700 px-3 py-2 text-sm font-bold active:bg-slate-600"
          onClick={()=>setShowManualBowler(v=>!v)} disabled={!isAdmin||finished}>
          {showManualBowler?"Cancel":"+ Name"}
        </button>
      </div>
      {showManualBowler&&<div className="mt-2 flex gap-2">
        <input aria-label="Manual bowler name" autoFocus className={`min-w-0 flex-1 ${cls}`}
          value={manualBowler} onChange={e=>setManualBowler(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")useManualBowler();}} placeholder="Enter bowler name" />
        <button type="button" className="rounded-xl bg-green-600 px-4 font-bold" onClick={useManualBowler}>Use</button>
      </div>}
      <p className="mt-1 text-xs text-green-300">{bowler
        ? `${bowler} stays selected until the over completes.`
        : bowlingGroups.assigned.length
          ? `Showing ${team(bowlingSide)} bowlers first; unassigned session players also available.`
          : `Choose from this session${teamAssignments.length ? " (unassigned players)" : ""}, or tap + Name.`}</p>
    </div>

    {!finished&&<>
      <div className="mt-3 grid grid-cols-4 gap-2" aria-label="One-tap cricket scoring">
        {[0, 1, 2, 3, 4, 6].map(n =>
          <button type="button" key={`runs-${n}`}
            className={`${keyButton} bg-slate-700`} disabled={disabledScoring}
            onClick={() => saveBall(n)}>{n}</button>
        )}
        <button type="button" className={`${keyButton} bg-rose-800 text-base`} disabled={disabledScoring}
          onClick={() => saveBall(0, "normal", true)}>W</button>
        <button type="button" className={`${keyButton} bg-slate-700 text-base`} disabled={!isAdmin || busy || !balls.length || finished}
          onClick={undo}>↶ Undo</button>
      </div>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Extras — directly tap the correct result</p>
      <div className="mt-2 grid grid-cols-4 gap-2" aria-label="One-tap extras scoring">
        {([
          {label:"WD", kind:"wide", add:0, total:1},
          {label:"WD+1", kind:"wide", add:1, total:2},
          {label:"WD+2", kind:"wide", add:2, total:3},
          {label:"WD+4", kind:"wide", add:4, total:5},
          {label:"NB", kind:"no_ball", add:0, total:1},
          {label:"NB+1", kind:"no_ball", add:1, total:2},
          {label:"NB+2", kind:"no_ball", add:2, total:3},
          {label:"NB+4", kind:"no_ball", add:4, total:5},
        ] as const).map(item =>
          <button type="button" key={item.label}
            className={`${keyButton} ${item.kind === "wide" ? "bg-amber-800" : "bg-orange-800"} flex flex-col items-center justify-center gap-0.5`}
            disabled={disabledScoring} onClick={() => saveBall(item.add, item.kind)}>
            <span className="text-base leading-tight">{item.label}</span>
            <span className="text-[10px] font-medium leading-tight text-amber-100">{`+${item.total} run${item.total === 1 ? "" : "s"}`}</span>
          </button>
        )}
      </div>
      <details className="mt-2 rounded-xl bg-slate-900 px-3 py-2">
        <summary className="cursor-pointer text-xs text-slate-300">Less common extras (WD+3, NB+3, NB+6)</summary>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button type="button" className={`${keyButton} bg-amber-800 text-sm`} disabled={disabledScoring} onClick={() => saveBall(3,"wide")}>WD+3</button>
          <button type="button" className={`${keyButton} bg-orange-800 text-sm`} disabled={disabledScoring} onClick={() => saveBall(3,"no_ball")}>NB+3</button>
          <button type="button" className={`${keyButton} bg-orange-800 text-sm`} disabled={disabledScoring} onClick={() => saveBall(6,"no_ball")}>NB+6</button>
        </div>
      </details>
      <p className="mt-2 text-xs text-slate-400">WD/NB give 1 penalty run automatically; + runs are additional. Wides and no-balls do not increase the legal-ball count.</p>
      {overReport&&<p role="status" className="mt-3 rounded-xl border border-green-500 bg-green-950 p-3 text-sm font-bold text-green-200">✅ {overReport}</p>}
      {reached&&<p className="mt-2 font-bold text-green-300">Target reached — finish the match.</p>}
      {inningsLimit&&<p className="mt-2 font-bold text-amber-300">Over limit reached — end innings.</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" className="flex-1 rounded-xl bg-amber-700 px-4 py-3 font-bold disabled:opacity-40"
          disabled={!isAdmin||busy||!current.length} onClick={endInnings}>{innings===1?"End 1st Innings":"Finish Match"}</button>
      </div>
    </>}

    <details className="mt-4 rounded-xl bg-slate-900 px-3 py-3">
      <summary className="cursor-pointer text-sm font-bold">Bowling summary · innings {innings}</summary>
      <div className="mt-3 space-y-2">{bowlingSummary.map(([name,v])=><div key={name} className="flex items-center justify-between gap-2 border-b border-slate-700 pb-2 text-sm"><span>{name}</span><span className="shrink-0 text-right">{Math.floor(v.balls/6)}.{v.balls%6} ov · {v.runs} runs · {v.wickets} W</span></div>)}{!bowlingSummary.length&&<p className="text-xs text-slate-400">No deliveries yet.</p>}</div>
      <p className="mt-3 text-xs text-slate-400">Last balls: {current.slice(-12).map(b=>`${b.wicket?"W":b.runs_bat+b.extra_runs}${b.extra_type?` ${b.extra_type==="wide"?"WD":"NB"}`:""}`).join(" · ")||"—"}</p>
    </details>
    <p className="mt-3 text-xs text-slate-500">W records a wicket. Run-outs, byes and leg-byes are not yet supported.</p>
  </section>;
}
