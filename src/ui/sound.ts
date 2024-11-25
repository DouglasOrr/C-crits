import * as Sim from "../game/sim"

const S = {
  debounceTime: 0.05, // s
  sounds: [
    [Sim.Event.Attack, "attack", { v: 0.4, dt: 300 }],
    [Sim.Event.CritDeath, "crit_death", { v: 0.3, dt: 300 }],
    [Sim.Event.CritSpawn, "crit_spawn", { v: 1.0 }],
    [Sim.Event.BaseCapture, "base_capture", { v: 1.0 }],
    [Sim.Event.BaseDeath, "base_death", { v: 1.0 }],
    [Sim.Event.ProgramLoad, "program_load", { v: 0.7 }],
    [Sim.Event.ProgramError, "program_error", { v: 1.0 }],
  ],
}

type Settings = { v: number; dt?: number }

class Sound {
  private lastTime: number = 0

  constructor(
    private audioContext: AudioContext,
    private buffer: AudioBuffer,
    private settings: Settings
  ) {}

  play() {
    const now = performance.now() / 1000
    if (this.lastTime + S.debounceTime < now) {
      this.lastTime = now
      const source = new AudioBufferSourceNode(this.audioContext, {
        buffer: this.buffer,
      })
      if (this.settings.dt) {
        source.detune.value = (Math.random() - 0.5) * this.settings.dt
      }
      source
        .connect(new GainNode(this.audioContext, { gain: this.settings.v }))
        .connect(this.audioContext.destination)
      source.start()
    }
  }
}

export async function load(): Promise<(event: Sim.Event) => void> {
  const audioContext = new window.AudioContext()
  const sounds = new Map<Sim.Event, Sound>()
  for (const [event, name, params] of S.sounds) {
    const buffer = await fetch(`sounds/${name}.ogg`)
      .then((response) => response.arrayBuffer())
      .then((data) => audioContext.decodeAudioData(data))
    const sound = new Sound(audioContext, buffer, params as Settings)
    sounds.set(event as Sim.Event, sound)
  }
  return (event: Sim.Event) => {
    if (enabled()) {
      sounds.get(event)?.play()
    }
  }
}

export function enabled(): boolean {
  return window.localStorage.getItem("sound") !== "off"
}

export function setEnabled(enabled: boolean): void {
  window.localStorage.setItem("sound", enabled ? "on" : "off")
}
