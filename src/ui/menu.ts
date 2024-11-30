import * as Page from "./page"
import * as Sound from "./sound"
import * as Levels from "../game/levels"

export class Menu {
  onPlay: (index: number) => void = () => {}

  constructor(private page: Page.Page) {}

  main() {
    this.page.showMenu("c-crits:~", [
      {
        name: "play",
        action: () => {
          this.levels()
        },
      },
      {
        name: "settings",
        action: () => {
          this.settings()
        },
      },
      {
        name: "toggle-full-screen",
        action: () => {
          if (document.fullscreenElement) {
            document.exitFullscreen()
          } else {
            document.documentElement.requestFullscreen()
          }
        },
      },
    ])
  }

  levels() {
    this.page.showMenu("c-crits:levels", [
      ...Levels.Levels.map((level, index) => ({
        name: `${index}-${level.Name}`,
        action: () => {
          this.onPlay(index)
        },
      })),
      { name: "back", action: () => this.main() },
    ])
  }

  gameOver(
    level: string,
    victory: boolean,
    achievementName: string,
    achievement: boolean
  ) {
    this.page.showMenu(`c-crits:${level}`, [
      { name: `outcome -- ${victory ? "VICTORY!" : "DEFEAT."}` },
      { name: `+ ${achievementName} -- ${achievement ? "YES!" : "NO."}` },
      { name: "back", action: () => this.levels() },
    ])
  }

  settings() {
    this.page.showMenu("c-crits:settings", [
      {
        name: `sound-${Sound.enabled() ? "off" : "on"}`,
        action: (e: HTMLElement) => {
          const enable = e.textContent === "sound-on"
          Sound.setEnabled(enable)
          e.textContent = `sound-${enable ? "off" : "on"}`
        },
      },
      { name: "back", action: () => this.main() },
    ])
  }

  hide() {
    this.page.hideMenu()
  }
}
