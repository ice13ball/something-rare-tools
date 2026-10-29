# Abyssal Claims Tools

A browser-first checker for marine datasets, served at https://tools.something-rare.com.
Drop CSV/xlsx files (or point at a public record); the tool proposes a column mapping,
runs declarative, cited rules (licence, metadata versus data, rows, cross-file, chemistry),
shows a two-layer report and a map, and exports a clean CSV, GeoJSON and metadata drafts.
Checks run in your browser; dropped files never leave it.

## What is in here

Six pages, all public: each is in the sitemap, and the first four tools are in the main menu on the home page.
None is hidden or unlisted.

| Path | What it is |
|---|---|
| `/` | Home: the menu of the tools |
| `/check` | Data check: CSV/Excel files or a link to a record; coordinates, dates, units and licence explained in plain words |
| `/licence` | Licence check: one dataset, the licence each metadata source states, and where the sources disagree |
| `/collection` | Collection review: a whole collection (DOI list, DataCite repository, Zenodo community, GeoNetwork catalogue) as a fix list |
| `/convert` | Darwin Core converter: a spreadsheet of samples to a Darwin Core Archive (Event, Occurrence, eMoF, EML) for OBIS |
| `/privacy` | Privacy statement (linked from the footer, not from the menu) |

The full description of every application and its logic is in [`docs/APPS.md`](docs/APPS.md). The
rules the checks apply are listed in [`docs/rules.md`](docs/rules.md).

The repository has two parts: a Vite + React front end (all checks run in the browser) and a small
Express server (`server/`). The server serves the built pages and one proxy, `POST /api/fetch`, which the
pages use when you point at a public record (Zenodo, PANGAEA, GBIF, DataCite, Dataverse, GeoNetwork and
similar). It only contacts hosts on an allowlist. Files you drop never reach the server.

## Run it on your own computer

What was actually tried: on a Mac with Node 22, `npm ci`, `npm run typecheck`, `npm run dev`,
`npm run build` and `npm start` were run and the pages fetched. The Homebrew, Linux, Windows and Docker
commands were **not** run by the author of this file: they are taken from the official pages linked next to
them (Docker: no daemon was available). If one no longer matches its source, trust the source and open an issue.

### Two ways to run it

| | `npm run dev` | `npm run build`, then `npm start` |
|---|---|---|
| For | working on the code (hot reload) | using the tools, as the public site runs them |
| URL | http://localhost:5173 | http://localhost:8080 |
| `/api/fetch` (pointing at a public record) | **not served** (404) | served |
| Security headers (CSP etc.) | none | sent |
| Pages | open them with a trailing slash: `/check/`, `/convert/` | `/check`, `/convert` |

In development mode only Vite runs; the Express server does not. Checking dropped files works, but
fetching a public record does not. To use that, run the production build.
In dev mode a path without the trailing slash (for example `/check`) answers with the home page,
not an error, so use `/check/`.

### Prerequisites

- **Node.js 22 or newer** (`package.json` says `"node": ">=22"`) with npm, which comes with Node.js. The
  Docker image and the commands below use Node 22; newer LTS releases satisfy the same requirement but were
  not tried. Download: https://nodejs.org/en/download
- **Git**: https://git-scm.com/downloads
- Optional: **Docker**, for the container route: [Docker Desktop](https://docs.docker.com/get-started/get-docker/)
  (macOS, Windows, Linux) or [Docker Engine](https://docs.docker.com/engine/install/) (Linux).

No database, account or API key is needed.

### macOS

1. Install [Homebrew](https://brew.sh) if you do not have it (the command on that page), then:

   ```sh
   brew install git node@22
   brew link --force --overwrite node@22   # node@22 is keg-only: this puts node and npm on the PATH
   ```

   Alternative without Homebrew: [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) (install it
   with the script on that page, open a new terminal, then `nvm install 22`; `nvm use 22` in later terminals).
   Git also comes with the Xcode command line tools (`xcode-select --install`) or from the git-scm.com page.
2. Check the versions (Node must print `v22` or higher):

   ```sh
   node -v
   npm -v
   git --version
   ```
3. Get the code and install the exact dependency versions from `package-lock.json`:

   ```sh
   git clone https://github.com/ice13ball/something-rare-tools.git
   cd something-rare-tools
   npm ci
   ```
4. Development mode: `npm run dev`, then open http://localhost:5173 (pages: `/check/`, `/licence/`,
   `/collection/`, `/convert/`, `/privacy/`). Stop with `Ctrl+C`.
5. Production mode (all features, including `/api/fetch`):

   ```sh
   npm run build
   npm start
   ```

   Open http://localhost:8080. The server prints `{"listening":8080}`. Stop with `Ctrl+C`.
   Another port: `PORT=3000 npm start`, then open http://localhost:3000.

### Linux

Debian or Ubuntu, with the NodeSource packages
([instructions](https://github.com/nodesource/distributions)):

```sh
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh      # read the script first if you want to know what it does
sudo apt install -y nodejs
```

Fedora: the distribution's own packages are the simplest (`sudo dnf install git nodejs`). Check that
`node -v` prints 22 or higher; the version of Fedora's `nodejs` depends on the release. If it is older, use nvm.

Any distribution, with [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) (the script and its
version are on that page; git is installed separately, see https://git-scm.com/downloads/linux):

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
# close and reopen the terminal, then:
nvm install 22
```

Then, the same as on macOS:

```sh
node -v && npm -v && git --version      # Node v22 or higher
git clone https://github.com/ice13ball/something-rare-tools.git
cd something-rare-tools
npm ci
npm run dev                              # http://localhost:5173 ; Ctrl+C to stop
npm run build && npm start               # http://localhost:8080 ; Ctrl+C to stop
```

### Windows

Two routes: native Windows (PowerShell), or WSL2, where you follow the Linux steps in a Linux shell.

**Native, PowerShell** (a normal window, not "as administrator"):

1. Install Git and Node.js with [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/)
   (included in current Windows 10 and 11):

   ```powershell
   winget install --id Git.Git -e
   winget install --id OpenJS.NodeJS.22 -e
   ```

   `OpenJS.NodeJS.22` is the Node 22 line. `winget search OpenJS.NodeJS` lists the others (`OpenJS.NodeJS.LTS`
   is the current LTS, which may be newer than 22). Without winget, use the Windows installers from
   https://nodejs.org/en/download and https://git-scm.com/downloads/win.
   To switch between Node versions later, use [fnm](https://github.com/Schniz/fnm) (`winget install Schniz.fnm`) or
   [nvm-windows](https://github.com/coreybutler/nvm-windows) (install its setup program, then run
   `nvm install 22` and `nvm use 22` in an administrator shell, as its README says).
2. **Close the PowerShell window and open a new one** (the PATH changes only reach new windows), then check:

   ```powershell
   node -v
   npm -v
   git --version
   ```
3. Get the code and install. `core.autocrlf=false` makes Git keep the files as they are in the repository
   (see "Line endings" under Troubleshooting):

   ```powershell
   git clone -c core.autocrlf=false https://github.com/ice13ball/something-rare-tools.git
   cd something-rare-tools
   npm ci
   ```
4. Development: `npm run dev`, then open http://localhost:5173 (pages with a trailing slash: `/check/`).
   Stop with `Ctrl+C`.
5. Production mode:

   ```powershell
   npm run build
   npm start
   ```

   Open http://localhost:8080; stop with `Ctrl+C`. Another port: `$env:PORT = "3000"; npm start`.
   If Windows Defender Firewall asks whether Node.js may accept connections, allowing private networks only
   is enough: the tools are only needed on this computer.

If PowerShell says that `npm.ps1` cannot be loaded because running scripts is disabled, see Troubleshooting.

**WSL2** (an alternative that behaves like Linux): in an administrator PowerShell run `wsl --install`, then
restart the machine (see [Microsoft's page](https://learn.microsoft.com/en-us/windows/wsl/install); it
installs Ubuntu by default, and `wsl --list --online` shows other distributions). Open the Ubuntu terminal and
follow the **Linux** steps above (Debian or Ubuntu). Work inside the Linux file system (`~/`), not under
`/mnt/c`, which is slow for `npm ci`. WSL2 forwards `localhost`, so http://localhost:5173 and
http://localhost:8080 open in the Windows browser.

### Docker

Needs a running Docker daemon: start Docker Desktop, or on Linux run Docker Engine. The commands follow the
repository's `Dockerfile`, which builds on `node:22-slim`, runs `npm run build`, keeps only the runtime
dependencies and starts the server as the unprivileged `node` user on port 8080.

```sh
docker build -t abyssal-tools .
docker run --rm -p 8080:8080 abyssal-tools
```

Open http://localhost:8080. Stop with `Ctrl+C` (the container is removed because of `--rm`), or from another
terminal: `docker ps`, then `docker stop <container id>`. The container listens on port 8080 inside; the first
number in `-p` is the port on your computer, for example `-p 3000:8080` for http://localhost:3000.
Remove the image when you are done: `docker rmi abyssal-tools`. The container runs the production server, so
`/api/fetch` works.

## Development commands

```sh
npm run typecheck    # tsc for the app and for the server
npm test             # vitest run: the whole suite
npx vitest run test/server   # one folder or file only
npm run build        # vite build, then the server build into dist-server/
npm run test:perf    # the performance tests
```

`npm install` also works but may change `package-lock.json`; use `npm ci` to get exactly the locked versions
(`.npmrc` sets `save-exact=true` for the same reason). A few tests are opt-in and skipped unless an
environment variable is set.

### Golden test

`GOLDEN_DIR=/path/to/reference/records npx vitest run test/golden`

The golden records are private reference data. They are read from a local directory only
and are never part of this repository; the test is skipped when `GOLDEN_DIR` is unset.

### Setting an environment variable for one command

| Shell | Syntax (example with `GOLDEN_DIR`; `PORT` works the same way) |
|---|---|
| bash, zsh (macOS, Linux, WSL) | `GOLDEN_DIR=/path/to/records npx vitest run test/golden` |
| PowerShell | `$env:GOLDEN_DIR = "C:\path\to\records"; npx vitest run test/golden` (the variable stays set in that window; `Remove-Item Env:GOLDEN_DIR` clears it) |
| cmd.exe | `set "GOLDEN_DIR=C:\path\to\records" && npx vitest run test/golden` (stays set in that window; `set GOLDEN_DIR=` clears it) |

The `NAME=value command` form of bash does not work in PowerShell or cmd. No npm script in this repository
uses it, so the scripts themselves run unchanged on Windows.

## Troubleshooting

- **`node -v` prints less than v22**, or the build stops with syntax errors: an older Node is first on the
  PATH. With nvm: `nvm use 22`. With Homebrew: `brew link --force --overwrite node@22`. On Windows, open a
  new terminal after installing, and check `where.exe node` for a second, older installation.
- **Port in use** (`EADDRINUSE`, or the page is a different application): another program holds the port.
  For the production server pick another one: `PORT=3000 npm start` (PowerShell and cmd: see the table above).
  Vite (`npm run dev`) should take the next free port and print it; read its `Local:` line.
- **Pointing at a public record fails in `npm run dev`**: expected; `/api/fetch` exists only in the
  production server. Use `npm run build` and `npm start`.
- **`/check` shows the home page in dev mode**: use `/check/` with the trailing slash.
- **`npm start` fails because `dist-server/server/index.js` or `dist/` is missing**: run `npm run build` first.
- **Line endings (Windows)**: the repository stores its text files with LF endings and has no
  `.gitattributes`, so Git for Windows with its default `core.autocrlf=true` checks the files out with CRLF.
  The repository-reading tests that were looked at split on `\n` and trim each line, and no failure caused by
  CRLF is known, but the build and tests were only run on LF checkouts. Cloning with
  `-c core.autocrlf=false` (as above) avoids the question. To fix an existing clone, delete the folder and
  clone again with that option.
- **PowerShell: `npm.ps1 cannot be loaded because running scripts is disabled`**: the execution policy
  blocks npm's PowerShell wrapper. Either run `npm.cmd ci`, `npm.cmd run dev` and so on, or allow local scripts
  for your user only: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
  ([about_Execution_Policies](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies)).
- **`npm ci` prints `npm audit` warnings**: they concern development tools; `npm ci` does not change anything because of them.
- **Docker: `Cannot connect to the Docker daemon`**: start Docker Desktop (or `sudo systemctl start docker` on
  Linux) and run the command again.

The public site is deployed by the maintainers with `scripts/deploy.sh`; you do not need it to run the tools yourself.

## Licence

The code is licensed **GNU AGPL-3.0-or-later** (see [`LICENSE`](LICENSE)). AGPL means a modified
version offered to users over a network must also offer its complete source.

One **additional term under AGPL section 7(b)** applies: the author-attribution notice must be
preserved in the source and in the notices displayed by the running program (the footer of every
page carries it). It asks for a preserved line of text and a link — no logo, no badge. See
[`LICENSE-ADDITIONAL-TERMS.md`](LICENSE-ADDITIONAL-TERMS.md) and [`NOTICE`](NOTICE).

A commercial licence is available: see [`COMMERCIAL.md`](COMMERCIAL.md). Contributions: see
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Names and marks

"Abyssal Claims" and "something-rare.com" are not licensed under the AGPL. You may fork and adapt
the code, but not present a derivative as Abyssal Claims or Abyssal Claims Tools.

## Can I run this at my institution?

| Use | What the AGPL asks |
|---|---|
| Use the public site | nothing; files you drop never leave your browser |
| Run it unmodified, internally or publicly | keep the licence and notices; offering the source to users is the simple way to stay safe |
| Modify it for internal staff only | offer the modified source to those users; no public release needed |
| Modify it and run it publicly | publish your changes under the AGPL; the footer source link must point to your version |
| Embed the code in your own system or product | the combined work is likely covered by the AGPL too; if that does not fit, ask for a commercial licence ([`COMMERCIAL.md`](COMMERCIAL.md)) |

In every case keep the attribution notice in [`LICENSE-ADDITIONAL-TERMS.md`](LICENSE-ADDITIONAL-TERMS.md).
This table is a summary, not legal advice; the text of [`LICENSE`](LICENSE) governs.
