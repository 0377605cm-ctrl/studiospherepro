import { useEffect, useState, useCallback } from "react";
import {
  listOutputDevices,
  setOutputDevice,
  getOutputDeviceId,
  setVolume,
  getVolume,
  setMuted,
  isMuted,
  subscribeAudio,
  unlockAudio,
  requestDeviceLabelAccess,
  isSetSinkSupported,
  type AudioOutputDevice,
  type MixChannel,
} from "@/lib/audio/synth";

export function AudioMixer() {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [sinkId, setSinkId] = useState<string>("default");
  const [supported, setSupported] = useState(true);
  const [needLabels, setNeedLabels] = useState(false);
  const [, force] = useState(0);

  const refreshDevices = useCallback(async () => {
    const list = await listOutputDevices();
    setDevices(list);
    // If every label is empty/generic, we likely need mic permission.
    setNeedLabels(list.every((d) => !d.label || /audio output/i.test(d.label)));
  }, []);

  useEffect(() => {
    setSupported(isSetSinkSupported());
    setSinkId(getOutputDeviceId());
    void refreshDevices();
    const unsub = subscribeAudio(() => force((n) => n + 1));
    const onChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => {
      unsub();
      navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
    };
  }, [refreshDevices]);

  const handleOpen = async () => {
    setOpen((o) => !o);
    if (!open) {
      await unlockAudio();
      await refreshDevices();
    }
  };

  const handleDeviceChange = async (id: string) => {
    const ok = await setOutputDevice(id);
    if (ok) setSinkId(id);
  };

  const handleEnableLabels = async () => {
    const ok = await requestDeviceLabelAccess();
    if (ok) await refreshDevices();
  };

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:border-gold/50 hover:text-foreground"
        aria-label="Audio output and mixer"
        title="Audio output & mixer"
      >
        <SpeakerIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Audio</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-popover p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-widest text-gold">Audio Mixer</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close mixer"
              >
                ✕
              </button>
            </div>

            {/* Output device picker */}
            <div className="mb-4">
              <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Output Device
              </label>
              {!supported ? (
                <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  Your browser doesn’t support per-app output routing. Audio plays through your system default — change it in your OS sound settings.
                </div>
              ) : (
                <>
                  <select
                    value={sinkId}
                    onChange={(e) => void handleDeviceChange(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-gold focus:outline-none"
                  >
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  {needLabels && (
                    <button
                      onClick={handleEnableLabels}
                      className="mt-2 w-full rounded-md border border-gold/40 bg-gold/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-gold hover:bg-gold/20"
                    >
                      Enable device names
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Volume sliders */}
            <div className="space-y-3">
              <ChannelSlider channel="master" label="Master" />
              <ChannelSlider channel="piano" label="Piano" />
              <ChannelSlider channel="guitar" label="Guitar" />
            </div>

            <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
              Tip: pick headphones, speakers, or any connected output. Adjust each instrument level independently in the mix.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function ChannelSlider({ channel, label }: { channel: MixChannel; label: string }) {
  const [vol, setVol] = useState(() => getVolume(channel));
  const [muted, setLocalMuted] = useState(() => isMuted(channel));

  useEffect(() => {
    return subscribeAudio(() => {
      setVol(getVolume(channel));
      setLocalMuted(isMuted(channel));
    });
  }, [channel]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {Math.round(vol * 100)}
          </span>
          <button
            onClick={() => setMuted(channel, !muted)}
            className={`rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider transition-colors ${
              muted
                ? "bg-rose-500/20 text-rose-400"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {muted ? "Muted" : "Mute"}
          </button>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={vol}
        onChange={(e) => {
          const v = Number(e.target.value);
          setVol(v);
          setVolume(channel, v);
        }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-gold"
      />
    </div>
  );
}

function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}