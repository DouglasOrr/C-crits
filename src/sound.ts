import * as Sim from "./sim"

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

class GeneratedMusic {
  private lastTime: number = 0
  private oscillator: OscillatorNode

  constructor(
    private audioContext: AudioContext,
    private base: number,
    volume: number
  ) {
    this.oscillator = new OscillatorNode(audioContext, { type: "sine" })
    this.oscillator.frequency.setValueAtTime(base, audioContext.currentTime)
    this.oscillator
      .connect(new GainNode(audioContext, { gain: volume }))
      .connect(audioContext.destination)
    this.oscillator.start()
  }

  update(): void {
    const now = performance.now() / 1000
    if (this.lastTime + S.debounceTime < now) {
      this.lastTime = now
      const tones = [0, 3, 5, 7, 10, 12]
      this.oscillator.frequency.setValueAtTime(
        this.base *
          Math.pow(2, tones[Math.floor(tones.length * Math.random())] / 12),
        this.audioContext.currentTime
      )
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
  const music = new GeneratedMusic(audioContext, 220, 0.0) // needs improving!
  return (event: Sim.Event) => {
    sounds.get(event)?.play()
    music.update()
  }
}
