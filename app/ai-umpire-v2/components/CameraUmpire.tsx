"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type CameraDecision =
  | "fair"
  | "wide"
  | "no_ball"
  | "bowled"
  | "caught"
  | "lbw"
  | "run_out"
  | "stumped";

type CameraUmpireProps = {
  disabled?: boolean;
  onDecision: (
    decision: CameraDecision
  ) => void | Promise<void>;
};

type AnalysisResult = {
  decision: CameraDecision | "review";
  confidence: number;
  reason: string;
};

const MAX_RECORDING_SECONDS = 6;

export default function CameraUmpire({
  disabled = false,
  onDecision,
}: CameraUmpireProps) {
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const replayVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const [cameraSupported, setCameraSupported] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playbackRate, setPlaybackRate] = useState("0.5");
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [applyingDecision, setApplyingDecision] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(
    null
  );

  const statusText = useMemo(() => {
    if (disabled) return "Scoring unavailable";
    if (recording) return `Recording ${recordingSeconds}s`;
    if (cameraActive) return "Camera ready";
    return "Camera stopped";
  }, [disabled, recording, recordingSeconds, cameraActive]);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setCameraSupported(false);
    }

    return () => {
      stopCamera();

      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!recording) return;

    setRecordingSeconds(0);

    const interval = setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    if (!replayVideoRef.current) return;

    replayVideoRef.current.playbackRate = Number(playbackRate);
  }, [playbackRate, recordedUrl]);

  async function startCamera() {
    if (!cameraSupported || disabled) return;

    setErrorMessage("");
    setAnalysis(null);

    try {
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: {
            ideal: facingMode,
          },
          width: {
            ideal: 1280,
          },
          height: {
            ideal: 720,
          },
          frameRate: {
            ideal: 30,
            max: 60,
          },
        },
      });

      streamRef.current = stream;

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play();
      }

      setCameraActive(true);
    } catch (error) {
      setCameraActive(false);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to open the camera."
      );
    }
  }

  function stopCamera() {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    streamRef.current = null;

    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setRecording(false);
  }

  async function switchCamera() {
    if (recording) return;

    const nextMode =
      facingMode === "environment" ? "user" : "environment";

    setFacingMode(nextMode);

    if (cameraActive) {
      setTimeout(() => {
        startCamera();
      }, 50);
    }
  }

  function chooseRecorderMimeType() {
    const preferredTypes = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];

    return preferredTypes.find((type) =>
      MediaRecorder.isTypeSupported(type)
    );
  }

  function startDeliveryRecording() {
    if (
      disabled ||
      !cameraActive ||
      !streamRef.current ||
      recording
    ) {
      return;
    }

    setErrorMessage("");
    setAnalysis(null);
    recordedChunksRef.current = [];

    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl("");
    }

    try {
      const mimeType = chooseRecorderMimeType();

      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, {
            mimeType,
          })
        : new MediaRecorder(streamRef.current);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setErrorMessage("Delivery recording failed.");
        setRecording(false);
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });

        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setRecording(false);
        setRecordingSeconds(0);

        runPrototypeAnalysis();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);

      stopTimerRef.current = setTimeout(() => {
        stopDeliveryRecording();
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start delivery recording."
      );
    }
  }

  function stopDeliveryRecording() {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function runPrototypeAnalysis() {
    /*
      This is intentionally a safe placeholder.

      The next phase will replace this with frame extraction and a
      cricket-specific model for:
      - stump movement
      - front-foot crease position
      - wide-line crossing
      - waist-high no-ball
      - ball trajectory / LBW review
    */
    setAnalysis({
      decision: "review",
      confidence: 0,
      reason:
        "Replay captured. Select the umpire decision manually while the AI model is being trained.",
    });
  }

  function clearReplay() {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }

    setRecordedUrl("");
    setAnalysis(null);
  }

  async function applyDecision(decision: CameraDecision) {
    if (disabled || applyingDecision) return;

    setApplyingDecision(true);

    try {
      await onDecision(decision);
      clearReplay();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to apply umpire decision."
      );
    } finally {
      setApplyingDecision(false);
    }
  }

  return (
    <section className="rounded-3xl border border-cyan-500/30 bg-slate-900 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            📷 Camera AI Umpire
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Record each delivery, review it in slow motion and confirm
            the decision. Automatic detection will be added in stages.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-2 text-sm font-semibold ${
            cameraSupported
              ? "bg-green-500/20 text-green-300"
              : "bg-red-500/20 text-red-300"
          }`}
        >
          {cameraSupported ? statusText : "Camera not supported"}
        </span>
      </div>

      {!cameraSupported && (
        <p className="mt-5 rounded-xl bg-red-500/10 p-4 text-red-300">
          This browser does not support camera recording. Use the latest
          Chrome or Edge on a phone and open the HTTPS Vercel site.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">Live Camera</h3>

            <span className="text-xs text-slate-400">
              {facingMode === "environment"
                ? "Rear camera"
                : "Front camera"}
            </span>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl bg-black">
            <video
              ref={liveVideoRef}
              muted
              playsInline
              className="aspect-video w-full object-cover"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {!cameraActive ? (
              <button
                type="button"
                onClick={startCamera}
                disabled={!cameraSupported || disabled}
                className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40"
              >
                Start Camera
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                disabled={recording}
                className="rounded-xl border border-red-400 px-5 py-3 font-semibold text-red-300 disabled:opacity-40"
              >
                Stop Camera
              </button>
            )}

            <button
              type="button"
              onClick={switchCamera}
              disabled={!cameraSupported || disabled || recording}
              className="rounded-xl border border-slate-600 px-5 py-3 text-slate-300 disabled:opacity-40"
            >
              Switch Camera
            </button>
          </div>

          <div className="mt-3">
            {!recording ? (
              <button
                type="button"
                onClick={startDeliveryRecording}
                disabled={!cameraActive || disabled}
                className="w-full rounded-xl bg-red-500 px-5 py-4 text-lg font-bold text-white disabled:opacity-40"
              >
                ● Record Delivery
              </button>
            ) : (
              <button
                type="button"
                onClick={stopDeliveryRecording}
                className="w-full rounded-xl bg-yellow-400 px-5 py-4 text-lg font-bold text-slate-950"
              >
                ■ Stop Recording ({recordingSeconds}s)
              </button>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Recording stops automatically after{" "}
            {MAX_RECORDING_SECONDS} seconds.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">Delivery Replay</h3>

            <select
              value={playbackRate}
              onChange={(event) => {
                setPlaybackRate(event.target.value);
              }}
              disabled={!recordedUrl}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm disabled:opacity-40"
            >
              <option value="1">Normal speed</option>
              <option value="0.75">0.75×</option>
              <option value="0.5">0.5× slow motion</option>
              <option value="0.25">0.25× slow motion</option>
            </select>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl bg-black">
            {recordedUrl ? (
              <video
                ref={replayVideoRef}
                src={recordedUrl}
                controls
                playsInline
                className="aspect-video w-full object-contain"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center px-4 text-center text-slate-500">
                Record a delivery to review it here.
              </div>
            )}
          </div>

          {analysis && (
            <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
              <p className="text-sm font-semibold text-cyan-300">
                AI Review
              </p>

              <p className="mt-2 text-sm text-slate-300">
                {analysis.reason}
              </p>
            </div>
          )}

          {recordedUrl && (
            <>
              <h4 className="mt-5 font-bold">
                Confirm Umpire Decision
              </h4>

              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                <DecisionButton
                  label="Fair Ball"
                  disabled={applyingDecision || disabled}
                  onClick={() => applyDecision("fair")}
                />

                <DecisionButton
                  label="Wide"
                  disabled={applyingDecision || disabled}
                  onClick={() => applyDecision("wide")}
                />

                <DecisionButton
                  label="No-ball"
                  disabled={applyingDecision || disabled}
                  onClick={() => applyDecision("no_ball")}
                />

                <DecisionButton
                  label="Bowled"
                  disabled={applyingDecision || disabled}
                  onClick={() => applyDecision("bowled")}
                />

                <DecisionButton
                  label="Caught"
                  disabled={applyingDecision || disabled}
                  onClick={() => applyDecision("caught")}
                />

                <DecisionButton
                  label="LBW"
                  disabled={applyingDecision || disabled}
                  onClick={() => applyDecision("lbw")}
                />

                <DecisionButton
                  label="Run Out"
                  disabled={applyingDecision || disabled}
                  onClick={() => applyDecision("run_out")}
                />

                <DecisionButton
                  label="Stumped"
                  disabled={applyingDecision || disabled}
                  onClick={() => applyDecision("stumped")}
                />

                <button
                  type="button"
                  onClick={clearReplay}
                  disabled={applyingDecision}
                  className="rounded-xl border border-slate-600 px-4 py-3 font-semibold text-slate-300 disabled:opacity-40"
                >
                  Discard Clip
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <p className="mt-5 rounded-xl bg-red-500/10 p-4 text-red-300">
          {errorMessage}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <h3 className="font-bold">AI detection roadmap</h3>

        <p className="mt-2 text-sm text-slate-300">
          Bowled/stump movement → front-foot no-ball → wide-line
          detection → waist-high no-ball → run-out/stumping replay →
          experimental LBW trajectory.
        </p>
      </div>
    </section>
  );
}

function DecisionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-40"
    >
      {label}
    </button>
  );
}