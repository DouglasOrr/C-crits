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
        name: "toggle-full-screen",
        action: () => {
          if (document.fullscreenElement) {
            document.exitFullscreen()
          } else {
            document.documentElement.requestFullscreen()
          }
        },
      },
      {
        name: "settings",
        action: () => {
          this.settings()
        },
      },
      {
        name: "credits",
        action: () => {
          this.credits()
        },
      },
    ])
  }

  levels() {
    let moreLevels = true
    let options = []
    Levels.Levels.forEach((level, index) => {
      if (moreLevels) {
        const completed = Boolean(window.localStorage.getItem(level.Name))
        const achieved = Boolean(
          window.localStorage.getItem(`${level.Name}-${level.Achievement.name}`)
        )
        options.push({
          name: `${index}-${level.Name}`,
          pre: Page.createLevelStatus(completed, achieved),
          action: () => {
            this.onPlay(index)
          },
        })
        if (!window.localStorage.getItem(level.Name)) {
          moreLevels = false
        }
      }
    })
    if (moreLevels) {
      options.push({
        name: "COMPLETED",
        action: () => {
          this.completed()
        },
      })
    }
    options.push({ name: "back", action: () => this.main() })
    this.page.showMenu("c-crits:levels", options)
  }

  gameOver(
    level: string,
    victory: boolean,
    achievement: { name: string; description: string },
    achieved: boolean,
    losses: [number, number, number]
  ) {
    const index = Levels.index(level)
    const options = [
      {
        name: `retry--${level}`,
        action: () => {
          this.onPlay(index)
        },
      },
    ]
    if (index < Levels.Levels.length - 1) {
      options.push({
        name: `next--${Levels.Levels[index + 1].Name}`,
        action: () => {
          this.onPlay(index + 1)
        },
      })
    } else {
      options.push({ name: "next--COMPLETED", action: () => this.completed() })
    }
    options.push({ name: "back", action: () => this.levels() })
    this.page.showMenu(
      `c-crits:${level}`,
      options,
      /*context*/ {
        name: "outcome.txt",
        body: Page.createLevelReport(
          level,
          victory,
          achievement,
          achieved,
          losses
        ),
      }
    )
  }

  completed() {
    this.page.showMenu(
      "c-crits:complete",
      [{ name: "back", action: () => this.levels() }],
      /*context*/ {
        name: "message.txt",
        body: Page.createReport(
          "Dear <player>,",
          "Congratulations! You have completed all levels!",
          "You can now consider yourself a crasm GM & certifiable friend-of-crits.",
          "I hope you enjoyed it. Sorry there was no C compiler.",
          "Best,",
          "Doug"
        ),
      }
    )
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
      {
        name: "reset-all",
        action: () => {
          if (
            confirm("Are you sure you want to reset all progress & settings?")
          ) {
            window.localStorage.clear()
            window.location.reload()
          }
        },
      },
      // {
      //   name: "unlock-all",
      //   action: () => {
      //     Levels.Levels.forEach((level) => {
      //       window.localStorage.setItem(level.Name, "true")
      //     })
      //     window.location.reload()
      //   },
      // },
      { name: "back", action: () => this.main() },
    ])
  }

  credits() {
    this.page.showMenu(
      "c-crits:credits",
      [
        {
          name: "back",
          action: () => this.main(),
        },
      ],
      /*context*/ {
        name: "credits.txt",
        body: Page.createReport(
          "          Sounds :: zapsplat.com",
          "           Icons :: fontawesome.com",
          "     Code editor :: prism-code-editor",
          "         Library :: three.js",
          "",
          " -- C-Crits is a game jam game by @DouglasOrr for GitHub Game Off 2024 --",
          "https://github.com/DouglasOrr/C-crits"
        ),
      }
    )
  }

  hide() {
    this.page.hideMenu()
  }
}
