# Brain home: setup, sync, and updates

The brain home is a git repo of your own. It holds your data: `brain.config.json`, your premises and notes, the standing DoD of each repo, and your own flows and skills. The brain repo holds only code. An update of the code never changes your home, and git keeps the home the same on each machine.

What you do:

- Keep the home in a private git repo, and install each machine with `scripts/install.sh --home-repo <url>`.
- Run `brain home sync` after a change. It commits, pulls, and pushes the home. Each new session pulls the home in the background.
- Update the brain with `git pull --ff-only` in the brain repo, then `scripts/install.sh`.

Contents:

- [Set up the first machine](#set-up-the-first-machine)
- [Add a second machine](#add-a-second-machine)
- [Keep two machines in sync](#keep-two-machines-in-sync)
- [Update the brain](#update-the-brain)
- [Share a premise with every user](#share-a-premise-with-every-user)
- [Move from a checkout that kept your data](#move-from-a-checkout-that-kept-your-data)
- [How the install treats the home](#how-the-install-treats-the-home)

## Set up the first machine

1. Create an empty private repo for your home, such as `my-brain-home` on GitHub. Do not add a README or a license, so the repo has no commit.
2. Clone the brain repo, and install it with your home repo:

   ```bash
   git clone https://github.com/d0whc3r/agent-brain.git ~/.local/share/agent-brain/repo
   cd ~/.local/share/agent-brain/repo
   scripts/install.sh --home-repo git@github.com:<you>/my-brain-home.git
   ```

   The install clones the empty repo into `~/.local/share/agent-brain/home`, and fills it from the template: a config with no scopes, the folders for your notes, and starter premises as candidates.

3. Add your scopes to `brain.config.json` in the home. The [catalog](catalog.md#scopes) shows the format.
4. List the starter premises with `brain premise list --status candidate`, and run `brain premise promote ID` for each one you want.
5. Commit and push the home:

   ```bash
   brain home sync
   ```

When an earlier install created the home with no remote, connect it to your empty repo instead of steps 1 and 2:

```bash
git -C "$(brain home)" remote add origin git@github.com:<you>/my-brain-home.git
brain home sync
```

## Add a second machine

Clone the brain repo, and install it with the same home repo:

```bash
git clone https://github.com/d0whc3r/agent-brain.git ~/.local/share/agent-brain/repo
cd ~/.local/share/agent-brain/repo
scripts/install.sh --home-repo git@github.com:<you>/my-brain-home.git
```

The install clones your home with every premise, note, standing DoD, flow, and skill. It adds no starter premises to a home that has data. Start a new chat session to load the premises.

- `--home-repo` clones only into an empty home. When the home is already a clone of the same repo, the install leaves it as it is. When the home has another origin, or none, the install stops and changes nothing: move that folder, or run without `--home-repo`.
- To keep the home in another folder, add `--home DIR`. The install clones into `DIR` and links `~/.local/share/agent-brain/home` to it. For a clone that you made yourself, `--home DIR` alone is enough.
- Review notes and screenshots stay on the machine that made them. The `.gitignore` of the home keeps them out of git.

## Keep two machines in sync

Run `brain home sync` after a change, or ask the agent to sync the brain. Claude Code asks you before the agent runs it. The command does four things:

1. It commits each change of the home with the message `brain: sync from <host>`.
2. It rebases the commits on `origin`.
3. It pushes them.
4. It checks the premises, as `brain premise check` does.

The session hook of Claude Code, Codex, and OpenCode starts `git pull --ff-only` of the home at the start of each session, and does not wait for it. When both machines have new commits, that pull changes nothing, and `brain home sync` rebases them.

`brain accept-skill` commits its own change. `brain home sync` commits every other change. These actions write to the home:

| Action | Changes in the home |
| --- | --- |
| `brain premise add`, `update`, `seen`, `promote`, and `rm`, and the `brain-learn` skill | `memory/premises/` and `memory/dropped/` |
| The `brain-learn` and `brain-harvest` skills | `memory/decisions/` |
| The `brain-garden` skill | `skills/drafts/` and `memory/patterns/` |
| `brain accept-skill` | `skills/active/`, with its own commit |
| The `brain-dod` skill, when you agree to a standing DoD | `dod/` |
| `brain home starters --apply`, and the install after an update | `memory/premises/`, and new template folders |
| A review | `memory/sessions/`, which stays on this machine |

When two machines change the same file, `brain home sync` stops, names the file, and prints the steps. Keep the right text in the file, then finish the rebase and sync again:

```bash
cd "$(brain home)"
git add memory/premises/<id>.md
git rebase --continue
brain home sync
```

`brain home sync` prints `ok: N premises` when every premise is valid. A new session loads the pulled premises. An open session keeps the premises that it printed at the start, but `premise_list` reads the files on each call.

## Update the brain

An update changes only the code. Run it on each machine:

```bash
cd ~/.local/share/agent-brain/repo
git pull --ff-only
scripts/install.sh
```

The install does three things for the home:

- It prints the lines of `CHANGELOG.md` since your last install.
- It adds each folder of a newer template to the home, with an empty `.gitkeep`. It changes no file.
- It tells you when the release adds starter premises. `brain home starters` lists them, and `brain home starters --apply` adds them as candidates. A starter premise that you removed never comes back.

When the install changed the home, run `brain home sync`. A release that changes the format of the home has a `BREAKING CHANGE` note in `CHANGELOG.md`, with the steps to follow.

## Share a premise with every user

A premise in your home applies only to you. To offer it to every user of the brain, add it to the starter premises in the brain repo:

1. Copy `memory/premises/<id>.md` from your home to `templates/home/memory/premises/<id>.md` in the brain repo.
2. In the copy, set `status: candidate` and `source: ""`, and remove the `seen` entries. A new home has no decision notes and no history.
3. Run `pnpm run check`, commit the file in the brain repo, and open a pull request.

Other users get the premise as a candidate with their next update, through `brain home starters`.

## Move from a checkout that kept your data

Before the brain home existed, the brain repo held the config, the premises, and the notes. Move them once:

1. Do not pull the old checkout. A pull removes the data files that git tracks.
2. Clone the new version into a new folder, and run `scripts/install.sh` there. Add `--home-repo` when you already have a home repo.
3. Run `brain home migrate --from <old checkout>`. It prints the plan: each file that it adds, updates, or leaves unchanged, and each conflict with a home file that you changed.
4. Run it again with `--apply`. It never overwrites a home file that you changed, and it exits 1 when a conflict keeps a file out.
5. Run `brain home sync`, then remove the old checkout.

## How the install treats the home

| The home | The install |
| --- | --- |
| Does not exist | Creates it from `templates/home`, and starts a git repo there |
| Is empty, with `--home-repo` | Clones the repo. An empty repo gets the template |
| Holds only `.git` | Fills it from the template |
| Holds your files | Changes no file, and adds the folders of a newer template |
| Has another origin, with `--home-repo` | Stops, and changes nothing |

`--home DIR` keeps the home in `DIR`, and links `~/.local/share/agent-brain/home` to it. `BRAIN_HOME` points the `brain` command at another home for one command. The uninstall never removes the home.
