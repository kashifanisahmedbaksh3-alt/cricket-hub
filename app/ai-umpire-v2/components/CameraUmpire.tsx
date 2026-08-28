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

type BufferedChunk = {
  blob: Blob;
  createdAt: number;
};

/*
 * We keep approximately the previous 8 seconds
 * available for instant replay.
 */
const REVIEW_BUFFER_SECONDS = 8;

/*
 * MediaRecorder emits a chunk every 500ms.
 * Smaller chunks make the rolling window smoother.
 */
const RECORDER_SLICE_MS = 500;

export default function CameraUmpire({
  disabled = false,
  onDecision,
}: CameraUmpireProps) {
  const liveVideoRef =
    useRef<HTMLVideoElement | null>(null);

  const replayVideoRef =
    useRef<HTMLVideoElement | null>(null);

  const mediaRecorderRef =
    useRef<MediaRecorder | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  /*
   * Rolling chunks.
   */
  const rollingChunksRef =
    useRef<BufferedChunk[]>([]);

  /*
   * Some browsers need the first recorder
   * chunk because it contains container metadata.
   */
  const initialChunkRef =
    useRef<Blob | null>(null);

  const recordedUrlRef =
    useRef("");

  const [cameraSupported, setCameraSupported] =
    useState(true);

  const [cameraActive, setCameraActive] =
    useState(false);

  const [umpireActive, setUmpireActive] =
    useState(false);

  const [bufferSeconds, setBufferSeconds] =
    useState(0);

  const [recordedUrl, setRecordedUrl] =
    useState("");

  const [playbackRate, setPlaybackRate] =
    useState("0.5");

  const [facingMode, setFacingMode] =
    useState<"environment" | "user">(
      "environment"
    );

  const [errorMessage, setErrorMessage] =
    useState("");

  const [
    applyingDecision,
    setApplyingDecision,
  ] = useState(false);

  const [creatingReplay, setCreatingReplay] =
    useState(false);

  const [analysis, setAnalysis] =
    useState<AnalysisResult | null>(null);

  const statusText = useMemo(() => {
    if (disabled) {
      return "Scoring unavailable";
    }

    if (umpireActive) {
      return "AI Umpire Live";
    }

    if (cameraActive) {
      return "Camera ready";
    }

    return "Camera stopped";
  }, [
    disabled,
    umpireActive,
    cameraActive,
  ]);

  /*
   * Browser capability check.
   */
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices
        ?.getUserMedia ||
      typeof MediaRecorder ===
        "undefined"
    ) {
      setCameraSupported(false);
    }

    return () => {
      stopEverything();

      if (recordedUrlRef.current) {
        URL.revokeObjectURL(
          recordedUrlRef.current
        );
      }
    };
  }, []);

  /*
   * Apply selected slow-motion rate
   * whenever replay changes.
   */
  useEffect(() => {
    if (!replayVideoRef.current) {
      return;
    }

    replayVideoRef.current.playbackRate =
      Number(playbackRate);
  }, [playbackRate, recordedUrl]);

  /*
   * Update rolling-buffer indicator.
   */
  useEffect(() => {
    if (!umpireActive) {
      setBufferSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      const chunks =
        rollingChunksRef.current;

      if (chunks.length === 0) {
        setBufferSeconds(0);
        return;
      }

      const oldest =
        chunks[0].createdAt;

      const newest =
        chunks[
          chunks.length - 1
        ].createdAt;

      const seconds =
        Math.max(
          1,
          Math.round(
            (newest - oldest) /
              1000
          )
        );

      setBufferSeconds(
        Math.min(
          seconds,
          REVIEW_BUFFER_SECONDS
        )
      );
    }, 500);

    return () =>
      clearInterval(interval);
  }, [umpireActive]);

  async function startCamera() {
    if (
      !cameraSupported ||
      disabled
    ) {
      return;
    }

    setErrorMessage("");
    setAnalysis(null);

    try {
      stopEverything();

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
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
          }
        );

      streamRef.current = stream;

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject =
          stream;

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

  function stopEverything() {
    const recorder =
      mediaRecorderRef.current;

    if (
      recorder &&
      recorder.state !== "inactive"
    ) {
      try {
        recorder.stop();
      } catch {
        // Safe cleanup.
      }
    }

    mediaRecorderRef.current = null;

    streamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    streamRef.current = null;

    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject =
        null;
    }

    rollingChunksRef.current = [];
    initialChunkRef.current = null;

    setCameraActive(false);
    setUmpireActive(false);
    setBufferSeconds(0);
  }

  function stopCamera() {
    stopEverything();
  }

  async function switchCamera() {
    if (umpireActive) {
      return;
    }

    const nextMode =
      facingMode === "environment"
        ? "user"
        : "environment";

    setFacingMode(nextMode);

    if (!cameraActive) {
      return;
    }

    stopEverything();

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: false,

            video: {
              facingMode: {
                ideal: nextMode,
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
          }
        );

      streamRef.current = stream;

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject =
          stream;

        await liveVideoRef.current.play();
      }

      setCameraActive(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to switch camera."
      );
    }
  }

  function chooseRecorderMimeType() {
    const preferredTypes = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];

    return preferredTypes.find(
      (type) =>
        MediaRecorder.isTypeSupported(
          type
        )
    );
  }

  /*
   * Press this ONE TIME before play begins.
   *
   * The recorder then continuously emits
   * small chunks while only the newest
   * ~8 seconds remain in memory.
   */
  function startAIUmpire() {
    if (
      disabled ||
      !cameraActive ||
      !streamRef.current ||
      umpireActive
    ) {
      return;
    }

    setErrorMessage("");
    setAnalysis(null);

    rollingChunksRef.current = [];
    initialChunkRef.current = null;

    clearReplay();

    try {
      const mimeType =
        chooseRecorderMimeType();

      const recorder = mimeType
        ? new MediaRecorder(
            streamRef.current,
            {
              mimeType,
            }
          )
        : new MediaRecorder(
            streamRef.current
          );

      recorder.ondataavailable = (
        event
      ) => {
        if (
          !event.data ||
          event.data.size === 0
        ) {
          return;
        }

        /*
         * Preserve first chunk because WebM
         * metadata may live inside it.
         */
        if (
          !initialChunkRef.current
        ) {
          initialChunkRef.current =
            event.data;
        }

        const now = Date.now();

        rollingChunksRef.current.push({
          blob: event.data,
          createdAt: now,
        });

        /*
         * Discard anything older than
         * our rolling replay window.
         */
        const cutoff =
          now -
          REVIEW_BUFFER_SECONDS *
            1000;

        rollingChunksRef.current =
          rollingChunksRef.current.filter(
            (chunk) =>
              chunk.createdAt >=
              cutoff
          );
      };

      recorder.onerror = () => {
        setErrorMessage(
          "Continuous camera recording failed."
        );

        setUmpireActive(false);
      };

      recorder.onstop = () => {
        setUmpireActive(false);
      };

      mediaRecorderRef.current =
        recorder;

      recorder.start(
        RECORDER_SLICE_MS
      );

      setUmpireActive(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start AI Umpire."
      );
    }
  }

  /*
   * Stops the rolling recorder but
   * leaves camera preview available.
   */
  function stopAIUmpire() {
    const recorder =
      mediaRecorderRef.current;

    if (
      recorder &&
      recorder.state !== "inactive"
    ) {
      try {
        recorder.stop();
      } catch {
        // Safe stop.
      }
    }

    mediaRecorderRef.current = null;

    rollingChunksRef.current = [];
    initialChunkRef.current = null;

    setUmpireActive(false);
    setBufferSeconds(0);
  }

  /*
   * Called AFTER a delivery when
   * somebody wants a replay.
   *
   * No need to start recording before
   * the ball.
   */
  async function reviewLastBall() {
    if (
      !umpireActive ||
      creatingReplay
    ) {
      return;
    }

    const recorder =
      mediaRecorderRef.current;

    if (
      !recorder ||
      recorder.state === "inactive"
    ) {
      setErrorMessage(
        "AI Umpire is not currently running."
      );

      return;
    }

    setCreatingReplay(true);
    setErrorMessage("");
    setAnalysis(null);

    try {
      /*
       * Force the recorder to flush its
       * most recent video data.
       */
      try {
        recorder.requestData();
      } catch {
        // Some browsers may ignore requestData.
      }

      /*
       * Small delay gives ondataavailable
       * time to deliver the newest chunk.
       */
      await new Promise<void>(
        (resolve) => {
          setTimeout(
            resolve,
            RECORDER_SLICE_MS + 150
          );
        }
      );

      const rollingChunks =
        rollingChunksRef.current;

      if (
        rollingChunks.length === 0
      ) {
        setErrorMessage(
          "There is not enough video in the replay buffer yet. Wait a few seconds and try again."
        );

        return;
      }

      const mimeType =
        recorder.mimeType ||
        "video/webm";

      const parts: BlobPart[] = [];

      /*
       * Keep browser/container metadata
       * when it is not already the first
       * retained rolling chunk.
       */
      if (
        initialChunkRef.current &&
        rollingChunks[0]?.blob !==
          initialChunkRef.current
      ) {
        parts.push(
          initialChunkRef.current
        );
      }

      rollingChunks.forEach(
        (chunk) => {
          parts.push(chunk.blob);
        }
      );

      const blob = new Blob(parts, {
        type: mimeType,
      });

      if (blob.size === 0) {
        setErrorMessage(
          "Unable to create replay clip."
        );

        return;
      }

      if (recordedUrlRef.current) {
        URL.revokeObjectURL(
          recordedUrlRef.current
        );
      }

      const url =
        URL.createObjectURL(blob);

      recordedUrlRef.current = url;
      setRecordedUrl(url);

      runPrototypeAnalysis();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to prepare replay."
      );
    } finally {
      setCreatingReplay(false);
    }
  }

  function runPrototypeAnalysis() {
    /*
     * Safe Stage 1 placeholder.
     *
     * Later we'll replace this with
     * actual computer-vision analysis:
     *
     * 1. Bowled / stump movement
     * 2. Front-foot no-ball
     * 3. Wide-line detection
     * 4. Waist-high no-ball
     * 5. Run-out / stumping
     * 6. Experimental LBW
     */

    setAnalysis({
      decision: "review",
      confidence: 0,
      reason:
        "Last-ball replay captured. Review the clip and confirm the umpire decision manually. Automatic AI detection will be added next.",
    });
  }

  function clearReplay() {
    if (recordedUrlRef.current) {
      URL.revokeObjectURL(
        recordedUrlRef.current
      );

      recordedUrlRef.current = "";
    }

    setRecordedUrl("");
    setAnalysis(null);
  }

  async function applyDecision(
    decision: CameraDecision
  ) {
    if (
      disabled ||
      applyingDecision
    ) {
      return;
    }

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
    <section className="rounded-3xl border border-cyan-500/30 bg-slate-900 p-4 sm:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            📷 Camera AI Umpire
          </h2>

          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Start the AI Umpire once.
            The camera continuously keeps
            the previous{" "}
            {REVIEW_BUFFER_SECONDS}{" "}
            seconds ready for instant
            replay.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-2 text-sm font-semibold ${
            !cameraSupported
              ? "bg-red-500/20 text-red-300"
              : umpireActive
              ? "bg-green-500/20 text-green-300"
              : "bg-slate-800 text-slate-300"
          }`}
        >
          {cameraSupported
            ? statusText
            : "Camera not supported"}
        </span>
      </div>

      {!cameraSupported && (
        <p className="mt-5 rounded-xl bg-red-500/10 p-4 text-red-300">
          This browser does not
          support camera recording.
          Use the latest Chrome,
          Edge or Safari on your
          phone and open the HTTPS
          Vercel site.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* LIVE CAMERA */}

        <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">
                Live Camera
              </h3>

              {umpireActive && (
                <p className="mt-1 text-xs font-semibold text-green-300">
                  ● CONTINUOUS REVIEW
                  ACTIVE
                </p>
              )}
            </div>

            <span className="text-xs text-slate-400">
              {facingMode ===
              "environment"
                ? "Rear camera"
                : "Front camera"}
            </span>
          </div>

          <div className="relative mt-4 overflow-hidden rounded-xl bg-black">
            <video
              ref={liveVideoRef}
              muted
              playsInline
              className="aspect-video w-full object-cover"
            />

            {umpireActive && (
              <>
                <div className="absolute left-3 top-3 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
                  ● LIVE
                </div>

                <div className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
                  Buffer{" "}
                  {bufferSeconds}s /{" "}
                  {
                    REVIEW_BUFFER_SECONDS
                  }
                  s
                </div>
              </>
            )}
          </div>

          {/* CAMERA CONTROLS */}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {!cameraActive ? (
              <button
                type="button"
                onClick={startCamera}
                disabled={
                  !cameraSupported ||
                  disabled
                }
                className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40"
              >
                📷 Start Camera
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="rounded-xl border border-red-400 px-5 py-3 font-semibold text-red-300"
              >
                Stop Camera
              </button>
            )}

            <button
              type="button"
              onClick={switchCamera}
              disabled={
                !cameraSupported ||
                disabled ||
                umpireActive
              }
              className="rounded-xl border border-slate-600 px-5 py-3 text-slate-300 disabled:opacity-40"
            >
              🔄 Switch Camera
            </button>
          </div>

          {/* START / STOP AI UMPIRE */}

          {cameraActive && (
            <div className="mt-3">
              {!umpireActive ? (
                <button
                  type="button"
                  onClick={
                    startAIUmpire
                  }
                  disabled={disabled}
                  className="w-full rounded-xl bg-green-500 px-5 py-4 text-lg font-black text-slate-950 disabled:opacity-40"
                >
                  ▶ START AI UMPIRE
                </button>
              ) : (
                <button
                  type="button"
                  onClick={
                    stopAIUmpire
                  }
                  className="w-full rounded-xl border border-yellow-400 px-5 py-3 font-semibold text-yellow-300"
                >
                  ■ Stop AI Umpire
                </button>
              )}
            </div>
          )}

          {/* REVIEW LAST BALL */}

          <div className="mt-3">
            <button
              type="button"
              onClick={
                reviewLastBall
              }
              disabled={
                !umpireActive ||
                creatingReplay ||
                bufferSeconds < 1
              }
              className="w-full rounded-xl bg-red-500 px-5 py-5 text-xl font-black text-white shadow-lg disabled:opacity-40"
            >
              {creatingReplay
                ? "Preparing Replay..."
                : "🎥 REVIEW LAST BALL"}
            </button>
          </div>

          {umpireActive && (
            <p className="mt-3 text-center text-xs leading-5 text-slate-400">
              You do not need to
              record each delivery.
              Tap{" "}
              <strong className="text-white">
                Review Last Ball
              </strong>{" "}
              only when a decision
              needs checking.
            </p>
          )}
        </div>

        {/* REPLAY */}

        <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">
              Last Ball Replay
            </h3>

            <select
              value={playbackRate}
              onChange={(event) => {
                setPlaybackRate(
                  event.target.value
                );
              }}
              disabled={!recordedUrl}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm disabled:opacity-40"
            >
              <option value="1">
                Normal
              </option>

              <option value="0.75">
                0.75×
              </option>

              <option value="0.5">
                0.5× Slow
              </option>

              <option value="0.25">
                0.25× Super Slow
              </option>
            </select>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl bg-black">
            {recordedUrl ? (
              <video
                ref={replayVideoRef}
                src={recordedUrl}
                controls
                playsInline
                autoPlay
                className="aspect-video w-full object-contain"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-slate-500">
                Keep AI Umpire
                running. If a delivery
                needs checking, tap
                Review Last Ball.
              </div>
            )}
          </div>

          {analysis && (
            <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
              <p className="text-sm font-semibold text-cyan-300">
                🤖 AI Review
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-300">
                {analysis.reason}
              </p>
            </div>
          )}

          {recordedUrl && (
            <>
              <h4 className="mt-5 font-bold">
                Confirm Umpire
                Decision
              </h4>

              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                <DecisionButton
                  label="Fair Ball"
                  disabled={
                    applyingDecision ||
                    disabled
                  }
                  onClick={() =>
                    applyDecision(
                      "fair"
                    )
                  }
                />

                <DecisionButton
                  label="Wide"
                  disabled={
                    applyingDecision ||
                    disabled
                  }
                  onClick={() =>
                    applyDecision(
                      "wide"
                    )
                  }
                />

                <DecisionButton
                  label="No-ball"
                  disabled={
                    applyingDecision ||
                    disabled
                  }
                  onClick={() =>
                    applyDecision(
                      "no_ball"
                    )
                  }
                />

                <DecisionButton
                  label="Bowled"
                  disabled={
                    applyingDecision ||
                    disabled
                  }
                  onClick={() =>
                    applyDecision(
                      "bowled"
                    )
                  }
                />

                <DecisionButton
                  label="Caught"
                  disabled={
                    applyingDecision ||
                    disabled
                  }
                  onClick={() =>
                    applyDecision(
                      "caught"
                    )
                  }
                />

                <DecisionButton
                  label="LBW"
                  disabled={
                    applyingDecision ||
                    disabled
                  }
                  onClick={() =>
                    applyDecision("lbw")
                  }
                />

                <DecisionButton
                  label="Run Out"
                  disabled={
                    applyingDecision ||
                    disabled
                  }
                  onClick={() =>
                    applyDecision(
                      "run_out"
                    )
                  }
                />

                <DecisionButton
                  label="Stumped"
                  disabled={
                    applyingDecision ||
                    disabled
                  }
                  onClick={() =>
                    applyDecision(
                      "stumped"
                    )
                  }
                />

                <button
                  type="button"
                  onClick={
                    clearReplay
                  }
                  disabled={
                    applyingDecision
                  }
                  className="rounded-xl border border-slate-600 px-4 py-3 font-semibold text-slate-300 disabled:opacity-40"
                >
                  Return to Live
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
        <h3 className="font-bold">
          🧠 AI Detection Roadmap
        </h3>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          First we will make
          continuous replay reliable
          on the turf. Then:
          Bowled / stump movement →
          front-foot no-ball →
          wide-line detection →
          waist-high no-ball →
          run-out / stumping →
          experimental LBW
          trajectory.
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