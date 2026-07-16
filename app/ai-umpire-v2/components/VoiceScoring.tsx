"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type VoiceLanguage = "english" | "hindi" | "hinglish";

export type VoiceCommand =
  | { type: "runs"; runs: number; label: string }
  | { type: "wide"; label: string }
  | { type: "no_ball"; label: string }
  | { type: "bye"; runs: number; label: string }
  | { type: "leg_bye"; runs: number; label: string }
  | { type: "wicket"; wicketType: "bowled" | "caught" | "lbw" | "run_out" | "stumped" | "hit_wicket"; label: string }
  | { type: "undo"; label: string }
  | { type: "unknown"; label: string };

type VoiceScoringProps = {
  disabled?: boolean;
  onRuns: (runs: number) => void | Promise<void>;
  onWide: () => void | Promise<void>;
  onNoBall: () => void | Promise<void>;
  onBye: (runs: number) => void | Promise<void>;
  onLegBye: (runs: number) => void | Promise<void>;
  onWicket: (wicketType: "bowled" | "caught" | "lbw" | "run_out" | "stumped" | "hit_wicket") => void | Promise<void>;
  onUndo: () => void | Promise<void>;
};

type SpeechRecognitionEventLike = { results: { [index: number]: { [index: number]: { transcript: string } } } };
type SpeechRecognitionErrorEventLike = { error?: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, dot: 0, duck: 0,
  one: 1, won: 1, ek: 1, एक: 1,
  two: 2, to: 2, too: 2, do: 2, दो: 2,
  three: 3, teen: 3, तीन: 3,
  four: 4, for: 4, chaar: 4, char: 4, chauka: 4, चौका: 4, चार: 4,
  five: 5, paanch: 5, panch: 5, पाँच: 5,
  six: 6, chhe: 6, che: 6, chhakka: 6, chakka: 6, छक्का: 6, छह: 6,
};

function cleanTranscript(input: string) {
  return input.toLowerCase().replace(/[.,!?;:]/g, " ").replace(/\s+/g, " ").trim();
}

function includesAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function findRuns(text: string): number | null {
  const numericMatch = text.match(/\b([0-6])\b/);
  if (numericMatch) return Number(numericMatch[1]);

  for (const word of text.split(" ")) {
    if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, word)) {
      return NUMBER_WORDS[word];
    }
  }

  if (text.includes("chauka")) return 4;
  if (text.includes("chhakka") || text.includes("chakka")) return 6;
  return null;
}

export function parseVoiceCommand(transcript: string): VoiceCommand {
  const text = cleanTranscript(transcript);
  if (!text) return { type: "unknown", label: "Nothing heard" };

  if (includesAny(text, ["undo", "go back", "cancel last", "wapas", "वापस", "galat entry", "गलत"])) {
    return { type: "undo", label: "Undo last event" };
  }
  if (includesAny(text, ["run out", "runout", "रन आउट"])) {
    return { type: "wicket", wicketType: "run_out", label: "Run out" };
  }
  if (includesAny(text, ["catch out", "caught", "catch", "कैच आउट"])) {
    return { type: "wicket", wicketType: "caught", label: "Caught" };
  }
  if (includesAny(text, ["clean bowled", "bowled", "bold", "बोल्ड"])) {
    return { type: "wicket", wicketType: "bowled", label: "Bowled" };
  }
  if (includesAny(text, ["lbw", "एल बी डब्ल्यू"])) {
    return { type: "wicket", wicketType: "lbw", label: "LBW" };
  }
  if (includesAny(text, ["stumped", "stumping", "स्टंप आउट"])) {
    return { type: "wicket", wicketType: "stumped", label: "Stumped" };
  }
  if (includesAny(text, ["hit wicket", "हिट विकेट"])) {
    return { type: "wicket", wicketType: "hit_wicket", label: "Hit wicket" };
  }
  if (includesAny(text, ["no ball", "noball", "नो बॉल", "no bowl"])) {
    return { type: "no_ball", label: "No-ball +1" };
  }
  if (includesAny(text, ["leg bye", "leg by", "लेग बाय"])) {
    const runs = findRuns(text) ?? 1;
    return { type: "leg_bye", runs, label: `${runs} leg bye${runs === 1 ? "" : "s"}` };
  }
  if (includesAny(text, ["bye", "byes", "बाय"])) {
    const runs = findRuns(text) ?? 1;
    return { type: "bye", runs, label: `${runs} bye${runs === 1 ? "" : "s"}` };
  }
  if (includesAny(text, ["wide", "वाइड", "white ball"])) {
    return { type: "wide", label: "Wide +1" };
  }
  if (includesAny(text, ["out", "wicket", "आउट", "विकेट"])) {
    return { type: "wicket", wicketType: "bowled", label: "Wicket (default: bowled)" };
  }

  const runs = findRuns(text);
  if (runs !== null) return { type: "runs", runs, label: `${runs} run${runs === 1 ? "" : "s"}` };
  return { type: "unknown", label: `Unrecognised command: ${transcript}` };
}

function languageCode(language: VoiceLanguage) {
  return language === "hindi" ? "hi-IN" : "en-IN";
}

export default function VoiceScoring({
  disabled = false,
  onRuns,
  onWide,
  onNoBall,
  onBye,
  onLegBye,
  onWicket,
  onUndo,
}: VoiceScoringProps) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [language, setLanguage] = useState<VoiceLanguage>("hinglish");
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [heardText, setHeardText] = useState("");
  const [pendingCommand, setPendingCommand] = useState<VoiceCommand | null>(null);
  const [executing, setExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const commandSummary = useMemo(() => pendingCommand?.label || "", [pendingCommand]);

  useEffect(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = languageCode(language);
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";
      setHeardText(transcript);
      setPendingCommand(parseVoiceCommand(transcript));
      setErrorMessage("");
    };
    recognition.onerror = (event) => {
      setErrorMessage(event.error || "Speech recognition failed");
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [language]);

  function startListening() {
    if (!supported || disabled || executing) return;
    setHeardText("");
    setPendingCommand(null);
    setErrorMessage("");

    const recognition = recognitionRef.current;
    if (!recognition) {
      setErrorMessage("Voice recognition is unavailable.");
      return;
    }

    recognition.lang = languageCode(language);
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setErrorMessage("Microphone is already active. Stop it and try again.");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  function cancelCommand() {
    setPendingCommand(null);
    setHeardText("");
    setErrorMessage("");
  }

  async function confirmCommand() {
    if (!pendingCommand || pendingCommand.type === "unknown" || disabled) return;
    setExecuting(true);

    try {
      switch (pendingCommand.type) {
        case "runs": await onRuns(pendingCommand.runs); break;
        case "wide": await onWide(); break;
        case "no_ball": await onNoBall(); break;
        case "bye": await onBye(pendingCommand.runs); break;
        case "leg_bye": await onLegBye(pendingCommand.runs); break;
        case "wicket": await onWicket(pendingCommand.wicketType); break;
        case "undo": await onUndo(); break;
      }
      setPendingCommand(null);
      setHeardText("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to apply voice command.");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-purple-500/30 bg-slate-900 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">🎙 Voice Scoring</h2>
          <p className="mt-1 text-sm text-slate-400">Speak in English, Hindi or Hinglish. Review every command before applying it.</p>
        </div>
        <span className={`rounded-full px-3 py-2 text-sm font-semibold ${supported ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
          {supported ? "Microphone supported" : "Not supported"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm text-slate-300">Voice language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value as VoiceLanguage)} disabled={isListening || executing} className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 disabled:opacity-50">
            <option value="english">English</option>
            <option value="hindi">Hindi</option>
            <option value="hinglish">Hinglish</option>
          </select>
        </div>

        <button type="button" onClick={isListening ? stopListening : startListening} disabled={!supported || disabled || executing} className={`rounded-xl px-5 py-3 font-semibold disabled:opacity-40 ${isListening ? "bg-red-500 text-white" : "bg-purple-500 text-white"}`}>
          {isListening ? "■ Stop Listening" : "🎙 Start Listening"}
        </button>

        <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
          <p className="text-sm text-slate-400">Status</p>
          <p className="mt-1 font-semibold">{disabled ? "Scoring unavailable" : isListening ? "Listening..." : executing ? "Applying command..." : "Ready"}</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <p className="text-sm text-slate-400">Examples</p>
        <p className="mt-2 text-sm text-slate-300">“Ek run”, “Do run”, “Chauka”, “Chhakka”, “Wide hai”, “No ball”, “Catch out”, “Bowled”, “LBW”, “Run out”, “Wapas”.</p>
      </div>

      {heardText && (
        <div className="mt-5 rounded-2xl border border-purple-500/40 bg-purple-500/10 p-5">
          <p className="text-sm text-purple-200">Heard</p>
          <p className="mt-1 text-lg font-bold">“{heardText}”</p>
          <p className="mt-3 text-sm text-slate-300">Action: <span className="font-semibold">{commandSummary}</span></p>

          {pendingCommand?.type === "unknown" ? (
            <p className="mt-3 text-yellow-300">Command not recognised. Try speaking again.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={confirmCommand} disabled={executing || disabled} className="rounded-xl bg-green-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40">
                {executing ? "Applying..." : "Confirm"}
              </button>
              <button type="button" onClick={cancelCommand} disabled={executing} className="rounded-xl border border-slate-500 px-5 py-3 text-slate-300 disabled:opacity-40">Cancel</button>
            </div>
          )}
        </div>
      )}

      {errorMessage && <p className="mt-4 rounded-xl bg-red-500/10 p-4 text-red-300">{errorMessage}</p>}
    </section>
  );
}