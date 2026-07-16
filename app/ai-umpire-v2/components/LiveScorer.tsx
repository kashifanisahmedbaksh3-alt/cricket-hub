"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import VoiceScoring from "./VoiceScoring";

export type Player = {
  id: string;
  name: string;
};

export type Match = {
  id: string;
  match_number: number;
  team_a: string | null;
  team_b: string | null;
  team_a_runs: number | null;
  team_a_wickets: number | null;
  team_b_runs: number | null;
  team_b_wickets: number | null;
  overs: number | null;
  winner: string | null;
  result_text: string | null;
  match_status: string | null;
  current_innings: number | null;
  target_runs: number | null;
  toss_winner?: string | null;
  toss_decision?: "bat" | "bowl" | null;
  batting_first_side?: "A" | "B" | null;
  batting_first_team?: string | null;
  striker_id?: string | null;
  non_striker_id?: string | null;
  bowler_id?: string | null;
};

type BallEvent = {
  id: string;
  match_id: string;
  innings_number: number;
  event_number: number;
  runs_bat: number;
  extras: number;
  extra_type: "wide" | "no_ball" | "bye" | "leg_bye" | null;
  is_legal_ball: boolean;
  is_wicket: boolean;
  wicket_type: string | null;
  description: string | null;
  striker_id: string | null;
  non_striker_id: string | null;
  bowler_id: string | null;
  dismissed_player_id: string | null;
  fielder_id: string | null;
  created_at: string;
};

type ExtraType = "wide" | "no_ball" | "bye" | "leg_bye";

type InningsScore = {
  runs: number;
  wickets: number;
  legalBalls: number;
  oversDisplay: string;
  runRate: number;
};

type BattingStat = {
  playerId: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
};

type BowlingStat = {
  playerId: string;
  name: string;
  legalBalls: number;
  runs: number;
  wickets: number;
  overs: string;
  economy: number;
};

type LiveScorerProps = {
  match: Match;
  teamAPlayers: Player[];
  teamBPlayers: Player[];
  teamAName: string;
  teamBName: string;
  isAdmin: boolean;
  onMatchUpdated?: () => void | Promise<void>;
};

function calculateInningsScore(events: BallEvent[]): InningsScore {
  const runs = events.reduce(
    (sum, event) =>
      sum + Number(event.runs_bat || 0) + Number(event.extras || 0),
    0
  );

  const wickets = events.filter((event) => event.is_wicket).length;
  const legalBalls = events.filter((event) => event.is_legal_ball).length;

  return {
    runs,
    wickets,
    legalBalls,
    oversDisplay: `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`,
    runRate: legalBalls > 0 ? runs / (legalBalls / 6) : 0,
  };
}

function oversFromBalls(legalBalls: number) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

export default function LiveScorer({
  match,
  teamAPlayers,
  teamBPlayers,
  teamAName,
  teamBName,
  isAdmin,
  onMatchUpdated,
}: LiveScorerProps) {
  const [inningsNumber, setInningsNumber] = useState(
    match.current_innings || 1
  );
  const [tossWinnerSide, setTossWinnerSide] = useState<"A" | "B" | "">(
    match.toss_winner === teamAName
      ? "A"
      : match.toss_winner === teamBName
        ? "B"
        : ""
  );
  const [tossDecision, setTossDecision] = useState<"bat" | "bowl" | "">(
    match.toss_decision || ""
  );
  const [battingFirstSide, setBattingFirstSide] = useState<"A" | "B" | "">(
    match.batting_first_side || ""
  );
  const [savingToss, setSavingToss] = useState(false);
  const [events, setEvents] = useState<BallEvent[]>([]);
  const [strikerId, setStrikerId] = useState(match.striker_id || "");
  const [nonStrikerId, setNonStrikerId] = useState(
    match.non_striker_id || ""
  );
  const [bowlerId, setBowlerId] = useState(match.bowler_id || "");
  const [fielderId, setFielderId] = useState("");
  const [wicketType, setWicketType] = useState("bowled");
  const [saving, setSaving] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    setInningsNumber(match.current_innings || 1);
    setTossWinnerSide(
      match.toss_winner === teamAName
        ? "A"
        : match.toss_winner === teamBName
          ? "B"
          : ""
    );
    setTossDecision(match.toss_decision || "");
    setBattingFirstSide(match.batting_first_side || "");
    setStrikerId(match.striker_id || "");
    setNonStrikerId(match.non_striker_id || "");
    setBowlerId(match.bowler_id || "");
    setFielderId("");
  }, [
    match.id,
    match.current_innings,
    match.toss_winner,
    match.toss_decision,
    match.batting_first_side,
    match.striker_id,
    match.non_striker_id,
    match.bowler_id,
    teamAName,
    teamBName,
  ]);

  useEffect(() => {
    loadBallEvents(match.id, inningsNumber);
  }, [match.id, inningsNumber]);

  async function loadBallEvents(matchId: string, innings: number) {
    setLoadingEvents(true);

    const { data, error } = await supabase
      .from("ball_events")
      .select("*")
      .eq("match_id", matchId)
      .eq("innings_number", innings)
      .order("event_number", { ascending: true });

    setLoadingEvents(false);

    if (error) {
      alert(error.message);
      return;
    }

    setEvents((data || []) as BallEvent[]);
  }

  const score = useMemo(() => calculateInningsScore(events), [events]);

  const playerMap = useMemo(() => {
    const map = new Map<string, string>();

    [...teamAPlayers, ...teamBPlayers].forEach((player) => {
      map.set(player.id, player.name);
    });

    return map;
  }, [teamAPlayers, teamBPlayers]);

  const inningsBattingSide: "A" | "B" | "" =
    battingFirstSide === ""
      ? ""
      : inningsNumber === 1
        ? battingFirstSide
        : battingFirstSide === "A"
          ? "B"
          : "A";

  const inningsBowlingSide: "A" | "B" | "" =
    inningsBattingSide === ""
      ? ""
      : inningsBattingSide === "A"
        ? "B"
        : "A";

  const battingPlayers =
    inningsBattingSide === "A"
      ? teamAPlayers
      : inningsBattingSide === "B"
        ? teamBPlayers
        : [];

  const bowlingPlayers =
    inningsBowlingSide === "A"
      ? teamAPlayers
      : inningsBowlingSide === "B"
        ? teamBPlayers
        : [];

  const battingTeamName =
    inningsBattingSide === "A"
      ? teamAName
      : inningsBattingSide === "B"
        ? teamBName
        : "Toss not completed";

  const bowlingTeamName =
    inningsBowlingSide === "A"
      ? teamAName
      : inningsBowlingSide === "B"
        ? teamBName
        : "Toss not completed";

  const chaseSummary = useMemo(() => {
    if (
      inningsNumber !== 2 ||
      !match.target_runs ||
      match.target_runs <= 0
    ) {
      return null;
    }

    const target = Number(match.target_runs);
    const requiredRuns = Math.max(target - score.runs, 0);
    const totalBalls = Number(match.overs || 7) * 6;
    const remainingBalls = Math.max(totalBalls - score.legalBalls, 0);
    const requiredRunRate =
      remainingBalls > 0 ? requiredRuns / (remainingBalls / 6) : 0;

    return {
      target,
      requiredRuns,
      remainingBalls,
      requiredRunRate,
    };
  }, [inningsNumber, match.target_runs, match.overs, score]);

  const lastBalls = useMemo(
    () => events.slice(-6).map(getEventLabel),
    [events]
  );

  const battingStats = useMemo(() => {
    const stats = new Map<string, BattingStat>();

    for (const event of events) {
      if (!event.striker_id) continue;

      const current = stats.get(event.striker_id) || {
        playerId: event.striker_id,
        name: playerMap.get(event.striker_id) || "Unknown",
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strikeRate: 0,
      };

      current.runs += Number(event.runs_bat || 0);

      if (event.is_legal_ball && event.extra_type !== "wide") {
        current.balls += 1;
      }

      if (event.runs_bat === 4) current.fours += 1;
      if (event.runs_bat === 6) current.sixes += 1;

      current.strikeRate =
        current.balls > 0 ? (current.runs / current.balls) * 100 : 0;

      stats.set(event.striker_id, current);
    }

    return [...stats.values()].sort((a, b) => b.runs - a.runs);
  }, [events, playerMap]);

  const bowlingStats = useMemo(() => {
    const stats = new Map<string, BowlingStat>();

    for (const event of events) {
      if (!event.bowler_id) continue;

      const current = stats.get(event.bowler_id) || {
        playerId: event.bowler_id,
        name: playerMap.get(event.bowler_id) || "Unknown",
        legalBalls: 0,
        runs: 0,
        wickets: 0,
        overs: "0.0",
        economy: 0,
      };

      if (event.is_legal_ball) current.legalBalls += 1;

      current.runs += Number(event.runs_bat || 0);

      if (event.extra_type === "wide" || event.extra_type === "no_ball") {
        current.runs += Number(event.extras || 0);
      }

      if (
        event.is_wicket &&
        !["run_out", "retired_out"].includes(event.wicket_type || "")
      ) {
        current.wickets += 1;
      }

      current.overs = oversFromBalls(current.legalBalls);
      current.economy =
        current.legalBalls > 0
          ? current.runs / (current.legalBalls / 6)
          : 0;

      stats.set(event.bowler_id, current);
    }

    return [...stats.values()].sort(
      (a, b) => b.wickets - a.wickets || a.runs - b.runs
    );
  }, [events, playerMap]);

  async function saveToss() {
    if (!isAdmin) {
      alert("Please log in as admin.");
      return;
    }

    if (events.length > 0 || match.match_status === "live" || match.match_status === "completed") {
      alert("The toss cannot be changed after scoring has started.");
      return;
    }

    if (!tossWinnerSide || !tossDecision) {
      alert("Select the toss winner and whether they chose to bat or bowl.");
      return;
    }

    const firstSide: "A" | "B" =
      tossDecision === "bat"
        ? tossWinnerSide
        : tossWinnerSide === "A"
          ? "B"
          : "A";

    const tossWinnerName =
      tossWinnerSide === "A" ? teamAName : teamBName;

    const firstTeamName =
      firstSide === "A" ? teamAName : teamBName;

    setSavingToss(true);

    const { error } = await supabase
      .from("matches")
      .update({
        toss_winner: tossWinnerName,
        toss_decision: tossDecision,
        batting_first_side: firstSide,
        batting_first_team: firstTeamName,
        current_innings: 1,
        striker_id: null,
        non_striker_id: null,
        bowler_id: null,
      })
      .eq("id", match.id);

    setSavingToss(false);

    if (error) {
      alert(error.message);
      return;
    }

    setBattingFirstSide(firstSide);
    setInningsNumber(1);
    setStrikerId("");
    setNonStrikerId("");
    setBowlerId("");
    setFielderId("");

    alert(
      `${tossWinnerName} won the toss and chose to ${tossDecision}.\n\n${firstTeamName} will bat first.`
    );

    await onMatchUpdated?.();
  }

  async function saveCurrentPlayers(
    nextStriker = strikerId,
    nextNonStriker = nonStrikerId,
    nextBowler = bowlerId
  ) {
    const { error } = await supabase
      .from("matches")
      .update({
        striker_id: nextStriker || null,
        non_striker_id: nextNonStriker || null,
        bowler_id: nextBowler || null,
      })
      .eq("id", match.id);

    if (error) {
      alert(error.message);
    }
  }

  async function swapStrike() {
    const nextStriker = nonStrikerId;
    const nextNonStriker = strikerId;

    setStrikerId(nextStriker);
    setNonStrikerId(nextNonStriker);

    await saveCurrentPlayers(nextStriker, nextNonStriker, bowlerId);
  }

  async function refreshPlayerStats() {
    const { error } = await supabase.rpc(
      "refresh_player_match_stats",
      {
        p_match_id: match.id,
      }
    );

    if (error) {
      console.error(
        "Player statistics refresh failed:",
        error.message
      );
    }
  }

  async function addBallEvent({
    runsBat = 0,
    extras = 0,
    extraType = null,
    isLegalBall = true,
    isWicket = false,
    selectedWicketType = null,
    description = null,
  }: {
    runsBat?: number;
    extras?: number;
    extraType?: ExtraType | null;
    isLegalBall?: boolean;
    isWicket?: boolean;
    selectedWicketType?: string | null;
    description?: string | null;
  }) {
    if (!isAdmin) {
      alert("Please log in as admin to score the match.");
      return;
    }

    if (match.match_status === "completed") {
      alert("This match has already been completed.");
      return;
    }

    if (!battingFirstSide) {
      alert("Complete the toss setup before scoring.");
      return;
    }

    if (!strikerId || !nonStrikerId || !bowlerId) {
      alert("Select striker, non-striker and bowler first.");
      return;
    }

    if (strikerId === nonStrikerId) {
      alert("Striker and non-striker must be different.");
      return;
    }

    setSaving(true);

    const nextEventNumber =
      events.length > 0
        ? Math.max(...events.map((event) => event.event_number)) + 1
        : 1;

    const dismissedPlayerId = isWicket ? strikerId : null;

    const { error } = await supabase.from("ball_events").insert({
      match_id: match.id,
      innings_number: inningsNumber,
      event_number: nextEventNumber,
      runs_bat: runsBat,
      extras,
      extra_type: extraType,
      is_legal_ball: isLegalBall,
      is_wicket: isWicket,
      wicket_type: selectedWicketType,
      description,
      striker_id: strikerId,
      non_striker_id: nonStrikerId,
      bowler_id: bowlerId,
      dismissed_player_id: dismissedPlayerId,
      fielder_id: fielderId || null,
    });

    if (error) {
      setSaving(false);
      alert(error.message);
      return;
    }

    await supabase
      .from("matches")
      .update({
        match_status: "live",
        current_innings: inningsNumber,
      })
      .eq("id", match.id);

    const legalBallCountAfter =
      score.legalBalls + (isLegalBall ? 1 : 0);

    const totalCompletedRuns = runsBat + extras;
    const inningsRunsAfter = score.runs + totalCompletedRuns;

    await loadBallEvents(match.id, inningsNumber);
    await refreshPlayerStats();

    const inningsBallLimit = Number(match.overs || 0) * 6;

    const inningsOversCompleted =
      inningsBallLimit > 0 &&
      legalBallCountAfter >= inningsBallLimit;

    if (
      inningsNumber === 2 &&
      match.target_runs &&
      inningsRunsAfter >= Number(match.target_runs)
    ) {
      await finishMatch(true, "target");
      setSaving(false);
      return;
    }

    if (inningsNumber === 1 && inningsOversCompleted) {
      await autoStartSecondInnings();
      setSaving(false);
      return;
    }

    if (inningsNumber === 2 && inningsOversCompleted) {
      await finishMatch(true, "overs");
      setSaving(false);
      return;
    }

    let nextStriker = strikerId;
    let nextNonStriker = nonStrikerId;

    if (totalCompletedRuns % 2 === 1) {
      [nextStriker, nextNonStriker] = [nextNonStriker, nextStriker];
    }

    const overCompleted =
      isLegalBall && legalBallCountAfter % 6 === 0;

    if (overCompleted) {
      [nextStriker, nextNonStriker] = [nextNonStriker, nextStriker];
    }

    if (isWicket) {
      nextStriker = "";
      setFielderId("");
    }

    const nextBowler = overCompleted ? "" : bowlerId;

    setStrikerId(nextStriker);
    setNonStrikerId(nextNonStriker);
    setBowlerId(nextBowler);

    await saveCurrentPlayers(
      nextStriker,
      nextNonStriker,
      nextBowler
    );

    setSaving(false);

    if (overCompleted) {
      alert("🏏 Over completed.\n\nSelect the bowler for the next over.");
    }
  }

  async function addWide() {
    await addBallEvent({
      extras: 1,
      extraType: "wide",
      isLegalBall: false,
      description: "Wide",
    });
  }

  async function addNoBall() {
    await addBallEvent({
      extras: 1,
      extraType: "no_ball",
      isLegalBall: false,
      description: "No-ball",
    });
  }

  async function addBye(runs: number) {
    await addBallEvent({
      extras: runs,
      extraType: "bye",
      isLegalBall: true,
      description: `${runs} bye${runs === 1 ? "" : "s"}`,
    });
  }

  async function addLegBye(runs: number) {
    await addBallEvent({
      extras: runs,
      extraType: "leg_bye",
      isLegalBall: true,
      description: `${runs} leg bye${runs === 1 ? "" : "s"}`,
    });
  }

  async function addWicket() {
    await addBallEvent({
      isLegalBall: wicketType !== "run_out",
      isWicket: true,
      selectedWicketType: wicketType,
      description: wicketType.replaceAll("_", " "),
    });
  }

  async function addVoiceWicket(
    voiceWicketType:
      | "bowled"
      | "caught"
      | "lbw"
      | "run_out"
      | "stumped"
      | "hit_wicket"
  ) {
    setWicketType(voiceWicketType);

    await addBallEvent({
      isLegalBall: voiceWicketType !== "run_out",
      isWicket: true,
      selectedWicketType: voiceWicketType,
      description: voiceWicketType.replaceAll("_", " "),
    });
  }

  async function undoLastBall() {
    if (!isAdmin || events.length === 0) return;

    const lastEvent = events[events.length - 1];

    if (!confirm(`Undo last event: ${getEventLabel(lastEvent)}?`)) {
      return;
    }

    const { error } = await supabase
      .from("ball_events")
      .delete()
      .eq("id", lastEvent.id);

    if (error) {
      alert(error.message);
      return;
    }

    setStrikerId(lastEvent.striker_id || "");
    setNonStrikerId(lastEvent.non_striker_id || "");
    setBowlerId(lastEvent.bowler_id || "");

    await saveCurrentPlayers(
      lastEvent.striker_id || "",
      lastEvent.non_striker_id || "",
      lastEvent.bowler_id || ""
    );

    await loadBallEvents(match.id, inningsNumber);
    await refreshPlayerStats();
  }

  async function autoStartSecondInnings() {
    if (!battingFirstSide) return;

    const { data, error: eventError } = await supabase
      .from("ball_events")
      .select("*")
      .eq("match_id", match.id)
      .eq("innings_number", 1)
      .order("event_number", { ascending: true });

    if (eventError) {
      alert(eventError.message);
      return;
    }

    const finalFirstInningsScore = calculateInningsScore(
      (data || []) as BallEvent[]
    );

    const target = finalFirstInningsScore.runs + 1;
    const firstSideIsA = battingFirstSide === "A";

    const { error } = await supabase
      .from("matches")
      .update({
        current_innings: 2,
        target_runs: target,
        match_status: "live",
        batting_first_team: firstSideIsA
          ? teamAName
          : teamBName,
        team_a_runs: firstSideIsA
          ? finalFirstInningsScore.runs
          : Number(match.team_a_runs || 0),
        team_a_wickets: firstSideIsA
          ? finalFirstInningsScore.wickets
          : Number(match.team_a_wickets || 0),
        team_b_runs: firstSideIsA
          ? Number(match.team_b_runs || 0)
          : finalFirstInningsScore.runs,
        team_b_wickets: firstSideIsA
          ? Number(match.team_b_wickets || 0)
          : finalFirstInningsScore.wickets,
        striker_id: null,
        non_striker_id: null,
        bowler_id: null,
      })
      .eq("id", match.id);

    if (error) {
      alert(error.message);
      return;
    }

    const firstTeamName =
      battingFirstSide === "A" ? teamAName : teamBName;

    setInningsNumber(2);
    setEvents([]);
    setStrikerId("");
    setNonStrikerId("");
    setBowlerId("");
    setFielderId("");

    alert(
      `🏏 First innings completed automatically!\n\n` +
        `${firstTeamName}: ` +
        `${finalFirstInningsScore.runs}/` +
        `${finalFirstInningsScore.wickets}\n\n` +
        `Target: ${target}`
    );

    await refreshPlayerStats();
    await onMatchUpdated?.();
    await loadBallEvents(match.id, 2);
  }

  async function startSecondInnings() {
    if (
      !isAdmin ||
      inningsNumber !== 1 ||
      events.length === 0 ||
      !battingFirstSide
    ) {
      return;
    }

    const target = score.runs + 1;

    if (
      !confirm(
        `End first innings at ${score.runs}/${score.wickets} and set target to ${target}?`
      )
    ) {
      return;
    }

    const firstSideIsA = battingFirstSide === "A";

    const updatePayload = {
      current_innings: 2,
      target_runs: target,
      match_status: "live",
      batting_first_team:
        battingFirstSide === "A" ? teamAName : teamBName,
      team_a_runs: firstSideIsA ? score.runs : Number(match.team_a_runs || 0),
      team_a_wickets: firstSideIsA ? score.wickets : Number(match.team_a_wickets || 0),
      team_b_runs: firstSideIsA ? Number(match.team_b_runs || 0) : score.runs,
      team_b_wickets: firstSideIsA ? Number(match.team_b_wickets || 0) : score.wickets,
      striker_id: null,
      non_striker_id: null,
      bowler_id: null,
    };

    const { error } = await supabase
      .from("matches")
      .update(updatePayload)
      .eq("id", match.id);

    if (error) {
      alert(error.message);
      return;
    }

    setInningsNumber(2);
    setEvents([]);
    setStrikerId("");
    setNonStrikerId("");
    setBowlerId("");
    setFielderId("");

    await onMatchUpdated?.();
  }

  async function finishMatch(
    automatic = false,
    automaticReason: "target" | "overs" = "target"
  ) {
    if (!isAdmin || inningsNumber !== 2 || !battingFirstSide) return;

    if (
      !automatic &&
      !confirm(
        `Finish match with second-innings score ${score.runs}/${score.wickets}?`
      )
    ) {
      return;
    }

    setSaving(true);

    const { data: allEvents, error: eventError } = await supabase
      .from("ball_events")
      .select("*")
      .eq("match_id", match.id)
      .order("innings_number", { ascending: true })
      .order("event_number", { ascending: true });

    if (eventError) {
      setSaving(false);
      alert(eventError.message);
      return;
    }

    const matchEvents = (allEvents || []) as BallEvent[];

    const firstScore = calculateInningsScore(
      matchEvents.filter((event) => event.innings_number === 1)
    );

    const secondScore = calculateInningsScore(
      matchEvents.filter((event) => event.innings_number === 2)
    );

    const firstTeamName =
      battingFirstSide === "A" ? teamAName : teamBName;
    const chasingTeamName =
      battingFirstSide === "A" ? teamBName : teamAName;

    let winner = "Tie";
    let resultText = "Match tied";

    if (secondScore.runs > firstScore.runs) {
      const wicketsRemaining = Math.max(10 - secondScore.wickets, 0);

      winner = chasingTeamName;
      resultText = `${chasingTeamName} won by ${wicketsRemaining} wicket${
        wicketsRemaining === 1 ? "" : "s"
      }`;
    } else if (secondScore.runs < firstScore.runs) {
      const margin = firstScore.runs - secondScore.runs;

      winner = firstTeamName;
      resultText = `${firstTeamName} won by ${margin} run${
        margin === 1 ? "" : "s"
      }`;
    }

    const teamAScore =
      battingFirstSide === "A" ? firstScore : secondScore;
    const teamBScore =
      battingFirstSide === "B" ? firstScore : secondScore;

    const { error } = await supabase
      .from("matches")
      .update({
        team_a_runs: teamAScore.runs,
        team_a_wickets: teamAScore.wickets,
        team_b_runs: teamBScore.runs,
        team_b_wickets: teamBScore.wickets,
        winner,
        result_text: resultText,
        current_innings: 2,
        match_status: "completed",
        completed_at: new Date().toISOString(),
        striker_id: null,
        non_striker_id: null,
        bowler_id: null,
      })
      .eq("id", match.id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert(
      `${
        automatic
          ? automaticReason === "target"
            ? "🏆 Target reached — match completed automatically!"
            : "🏏 All overs completed — match finished automatically!"
          : "Match completed!"
      }\n\n${firstTeamName}: ${firstScore.runs}/${firstScore.wickets}\n${chasingTeamName}: ${secondScore.runs}/${secondScore.wickets}\n\n${resultText}`
    );

    await refreshPlayerStats();
    await onMatchUpdated?.();
    await loadBallEvents(match.id, 2);
  }

  if (loadingEvents) {
    return (
      <section className="mt-8 rounded-3xl bg-slate-900 p-6">
        <p className="text-slate-400">Loading live score...</p>
      </section>
    );
  }

  const scoringDisabled =
    !isAdmin ||
    saving ||
    !battingFirstSide ||
    !bowlerId ||
    match.match_status === "completed";

  return (
    <div className="mt-8 space-y-8">
      <section className="rounded-3xl bg-slate-900 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold">🪙 Toss Setup</h2>
            <p className="mt-1 text-sm text-slate-400">
              Complete this before the first delivery. The selected batting order controls both innings and final score saving.
            </p>
          </div>

          {battingFirstSide && (
            <span className="rounded-full bg-green-500/20 px-3 py-2 text-sm font-semibold text-green-300">
              {battingFirstSide === "A" ? teamAName : teamBName} batting first
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-3 text-sm text-slate-300">Toss Winner</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTossWinnerSide("A")}
                disabled={
                  !isAdmin ||
                  events.length > 0 ||
                  match.match_status === "live" ||
                  match.match_status === "completed"
                }
                className={`rounded-xl border px-4 py-3 text-left font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  tossWinnerSide === "A"
                    ? "border-yellow-400 bg-yellow-400/15 text-yellow-200"
                    : "border-slate-700 bg-slate-800 hover:bg-slate-700"
                }`}
              >
                {teamAName}
              </button>

              <button
                type="button"
                onClick={() => setTossWinnerSide("B")}
                disabled={
                  !isAdmin ||
                  events.length > 0 ||
                  match.match_status === "live" ||
                  match.match_status === "completed"
                }
                className={`rounded-xl border px-4 py-3 text-left font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  tossWinnerSide === "B"
                    ? "border-yellow-400 bg-yellow-400/15 text-yellow-200"
                    : "border-slate-700 bg-slate-800 hover:bg-slate-700"
                }`}
              >
                {teamBName}
              </button>
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm text-slate-300">Decision</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTossDecision("bat")}
                disabled={
                  !isAdmin ||
                  events.length > 0 ||
                  match.match_status === "live" ||
                  match.match_status === "completed"
                }
                className={`rounded-xl border px-4 py-3 text-left font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  tossDecision === "bat"
                    ? "border-green-400 bg-green-400/15 text-green-200"
                    : "border-slate-700 bg-slate-800 hover:bg-slate-700"
                }`}
              >
                🏏 Bat first
              </button>

              <button
                type="button"
                onClick={() => setTossDecision("bowl")}
                disabled={
                  !isAdmin ||
                  events.length > 0 ||
                  match.match_status === "live" ||
                  match.match_status === "completed"
                }
                className={`rounded-xl border px-4 py-3 text-left font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  tossDecision === "bowl"
                    ? "border-blue-400 bg-blue-400/15 text-blue-200"
                    : "border-slate-700 bg-slate-800 hover:bg-slate-700"
                }`}
              >
                🎯 Bowl first
              </button>
            </div>
          </div>
        </div>

        {!battingFirstSide && isAdmin && (
          <button
            onClick={saveToss}
            disabled={savingToss || !tossWinnerSide || !tossDecision}
            className="mt-5 rounded-xl bg-yellow-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40"
          >
            {savingToss ? "Saving Toss..." : "Save Toss & Batting Order"}
          </button>
        )}

        {!battingFirstSide && (
          <p className="mt-4 rounded-xl bg-yellow-500/10 p-4 text-yellow-300">
            Scoring is locked until the toss and batting order are saved.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-green-300">
              {match.match_status === "completed"
                ? "Completed"
                : match.match_status === "live"
                  ? "● Live"
                  : "Not Started"}
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              Match {match.match_number}
            </h2>

            <p className="mt-2 text-slate-300">
              {teamAName} vs {teamBName}
            </p>

            <p className="mt-2 text-sm text-slate-400">
              {battingTeamName} batting
            </p>

            {match.result_text && (
              <p className="mt-4 text-lg font-bold text-green-300">
                🏆 {match.result_text}
              </p>
            )}
          </div>

          <div className="text-left md:text-right">
            <p className="text-5xl font-black">
              {score.runs}/{score.wickets}
            </p>

            <p className="mt-2 text-xl text-slate-300">
              {score.oversDisplay} overs
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Run rate: {score.runRate.toFixed(2)}
            </p>
          </div>
        </div>

        {chaseSummary && (
          <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/50 p-5">
            {chaseSummary.requiredRuns === 0 ? (
              <p className="text-2xl font-bold text-green-300">
                🏆 Target achieved
              </p>
            ) : (
              <>
                <p className="text-xl font-bold">
                  Need {chaseSummary.requiredRuns} runs from{" "}
                  {chaseSummary.remainingBalls} balls
                </p>

                <p className="mt-2 text-slate-300">
                  Target: {chaseSummary.target} • Required RR:{" "}
                  {chaseSummary.requiredRunRate.toFixed(2)}
                </p>
              </>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {lastBalls.length === 0 ? (
            <span className="text-slate-500">No balls recorded</span>
          ) : (
            lastBalls.map((label, index) => (
              <span
                key={`${label}-${index}`}
                className="flex h-10 min-w-10 items-center justify-center rounded-full bg-slate-700 px-3 font-bold"
              >
                {label}
              </span>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Current Players</h2>

        <p className="mt-1 text-sm text-slate-400">
          Batting: {battingTeamName} • Bowling: {bowlingTeamName}
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <PlayerSelect
            label="Striker"
            value={strikerId}
            players={battingPlayers}
            onChange={async (value) => {
              setStrikerId(value);
              await saveCurrentPlayers(
                value,
                nonStrikerId,
                bowlerId
              );
            }}
          />

          <PlayerSelect
            label="Non-striker"
            value={nonStrikerId}
            players={battingPlayers}
            excludeId={strikerId}
            onChange={async (value) => {
              setNonStrikerId(value);
              await saveCurrentPlayers(
                strikerId,
                value,
                bowlerId
              );
            }}
          />

          <PlayerSelect
            label="Bowler"
            value={bowlerId}
            players={bowlingPlayers}
            onChange={async (value) => {
              setBowlerId(value);
              await saveCurrentPlayers(
                strikerId,
                nonStrikerId,
                value
              );
            }}
          />
        </div>

        <button
          onClick={swapStrike}
          disabled={!isAdmin || !strikerId || !nonStrikerId}
          className="mt-4 rounded-xl border border-blue-400 px-4 py-2 text-blue-300 disabled:opacity-40"
        >
          ⇄ Swap Strike
        </button>

        {!bowlerId &&
          events.length > 0 &&
          match.match_status !== "completed" && (
            <p className="mt-4 rounded-xl bg-yellow-500/10 p-4 font-semibold text-yellow-300">
              🏏 Over completed. Select the bowler for the next over.
            </p>
          )}
      </section>

      <VoiceScoring
        disabled={
          !isAdmin ||
          saving ||
          !battingFirstSide ||
          !strikerId ||
          !nonStrikerId ||
          !bowlerId ||
          match.match_status === "completed"
        }
        onRuns={(runs) =>
          addBallEvent({
            runsBat: runs,
            isLegalBall: true,
            description: `${runs} run${runs === 1 ? "" : "s"}`,
          })
        }
        onWide={addWide}
        onNoBall={addNoBall}
        onBye={addBye}
        onLegBye={addLegBye}
        onWicket={addVoiceWicket}
        onUndo={undoLastBall}
      />

      <section className="rounded-3xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Live Scoring Controls</h2>

        <div className="mt-6 grid grid-cols-3 gap-3 md:grid-cols-7">
          {[0, 1, 2, 3, 4, 5, 6].map((runs) => (
            <ScoreButton
              key={runs}
              label={String(runs)}
              disabled={scoringDisabled}
              onClick={() =>
                addBallEvent({
                  runsBat: runs,
                  isLegalBall: true,
                  description: `${runs} run${runs === 1 ? "" : "s"}`,
                })
              }
            />
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <ActionButton
            label="Wide +1"
            disabled={scoringDisabled}
            onClick={addWide}
          />

          <ActionButton
            label="No-ball +1"
            disabled={scoringDisabled}
            onClick={addNoBall}
          />

          <ActionButton
            label="Bye +1"
            disabled={scoringDisabled}
            onClick={() => addBye(1)}
          />

          <ActionButton
            label="Leg Bye +1"
            disabled={scoringDisabled}
            onClick={() => addLegBye(1)}
          />
        </div>

        <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800 p-5">
          <h3 className="text-lg font-bold">Wicket</h3>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select
              value={wicketType}
              onChange={(event) => setWicketType(event.target.value)}
              disabled={!isAdmin || match.match_status === "completed"}
              className="rounded-xl border border-slate-600 bg-slate-900 p-3"
            >
              <option value="bowled">Bowled</option>
              <option value="caught">Caught</option>
              <option value="lbw">LBW</option>
              <option value="run_out">Run Out</option>
              <option value="stumped">Stumped</option>
              <option value="hit_wicket">Hit Wicket</option>
              <option value="retired_out">Retired Out</option>
            </select>

            <PlayerSelect
              label="Fielder (optional)"
              value={fielderId}
              players={bowlingPlayers}
              onChange={setFielderId}
            />

            <button
              onClick={addWicket}
              disabled={
                scoringDisabled ||
                !strikerId
              }
              className="rounded-xl bg-red-500 px-5 py-3 font-bold disabled:opacity-40"
            >
              Wicket
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <button
            onClick={undoLastBall}
            disabled={!isAdmin || events.length === 0}
            className="rounded-xl border border-yellow-400 px-5 py-3 font-semibold text-yellow-300 disabled:opacity-40"
          >
            ↩ Undo Last Event
          </button>

          {inningsNumber === 1 ? (
            <button
              onClick={startSecondInnings}
              disabled={
                !isAdmin ||
                events.length === 0 ||
                match.match_status === "completed"
              }
              className="rounded-xl bg-blue-500 px-5 py-3 font-semibold disabled:opacity-40"
            >
              Start Second Innings
            </button>
          ) : (
            <button
              onClick={() => finishMatch(false)}
              disabled={
                !isAdmin ||
                events.length === 0 ||
                match.match_status === "completed"
              }
              className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40"
            >
              Finish Match & Save Result
            </button>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ScorecardTable
          title="Batting Scorecard"
          headers={["Batter", "R", "B", "4s", "6s", "SR"]}
          rows={battingStats.map((stat) => [
            `${stat.name}${stat.playerId === strikerId ? " *" : ""}`,
            String(stat.runs),
            String(stat.balls),
            String(stat.fours),
            String(stat.sixes),
            stat.strikeRate.toFixed(1),
          ])}
        />

        <ScorecardTable
          title="Bowling Scorecard"
          headers={["Bowler", "O", "R", "W", "Econ"]}
          rows={bowlingStats.map((stat) => [
            stat.name,
            stat.overs,
            String(stat.runs),
            String(stat.wickets),
            stat.economy.toFixed(2),
          ])}
        />
      </section>

      <section className="rounded-3xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Ball-by-Ball Timeline</h2>

        <div className="mt-5 space-y-3">
          {events.length === 0 && (
            <p className="text-slate-400">
              No ball events recorded for this innings.
            </p>
          )}

          {[...events].reverse().map((event) => (
            <div
              key={event.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-bold">
                  Event {event.event_number}:{" "}
                  {getEventDescription(event)}
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  {playerMap.get(event.striker_id || "") ||
                    "Unknown batter"}{" "}
                  facing{" "}
                  {playerMap.get(event.bowler_id || "") ||
                    "Unknown bowler"}
                </p>
              </div>

              <div className="text-lg font-bold">
                {getEventLabel(event)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function getEventLabel(event: BallEvent) {
  if (event.is_wicket) return "W";
  if (event.extra_type === "wide")
    return event.extras > 1 ? `${event.extras}Wd` : "Wd";
  if (event.extra_type === "no_ball")
    return event.runs_bat > 0
      ? `Nb+${event.runs_bat}`
      : "Nb";
  if (event.extra_type === "bye") return `${event.extras}B`;
  if (event.extra_type === "leg_bye")
    return `${event.extras}Lb`;

  return String(event.runs_bat);
}

function getEventDescription(event: BallEvent) {
  if (event.is_wicket) {
    return `Wicket — ${(
      event.wicket_type || "dismissal"
    ).replaceAll("_", " ")}`;
  }

  return event.description || getEventLabel(event);
}

function PlayerSelect({
  label,
  value,
  onChange,
  players,
  excludeId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void | Promise<void>;
  players: Player[];
  excludeId?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-slate-300">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3"
      >
        <option value="">Select player</option>

        {players
          .filter((player) => player.id !== excludeId)
          .map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
      </select>
    </div>
  );
}

function ScoreButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl bg-green-500 py-4 text-xl font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 font-semibold hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function ScorecardTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="rounded-3xl bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">{title}</h2>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              {headers.map((header) => (
                <th key={header} className="py-2 pr-4">
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-slate-800"
              >
                {row.map((value, columnIndex) => (
                  <td
                    key={`${rowIndex}-${columnIndex}`}
                    className={`py-3 pr-4 ${
                      columnIndex === 0 ? "font-semibold" : ""
                    }`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="mt-4 text-slate-400">No statistics yet.</p>
        )}
      </div>
    </div>
  );
}