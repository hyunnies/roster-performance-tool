#!/bin/bash
# Double-click to start the Roster Performance Tool on a Mac.
# The first run installs what it needs (a minute or two); after that it
# starts in a few seconds. Close this window to stop the tool.

cd "$(dirname "$0")" || exit 1
PORT="${PORT:-3002}"
URL="http://localhost:$PORT"

fail() {
  echo
  echo "$1"
  echo
  read -n 1 -s -r -p "Press any key to close this window."
  exit 1
}

# Already running (e.g. started from another window)? Just open it.
if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/state"; then
  echo "The Roster Performance Tool is already running."
  [ -z "$NO_OPEN" ] && open "$URL"
  exit 0
fi

# Node.js installed from nodejs.org lives in /usr/local/bin, which a
# double-clicked window does not always have on its PATH.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  open "https://nodejs.org/en/download"
  fail "Node.js isn't installed yet. Install the LTS version from the page that just opened, then double-click Start Roster Tool again."
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=12)?0:1)'; then
  open "https://nodejs.org/en/download"
  fail "This tool needs a newer Node.js (you have $(node -v)). Install the LTS version from the page that just opened, then try again."
fi

if [ ! -d node_modules ]; then
  echo "First run: installing what the tool needs. This takes a minute or two…"
  npm install --no-audit --no-fund || fail "The install didn't finish. Check your internet connection and try again."
fi

echo "Starting…"
npm run build >/dev/null || fail "The tool couldn't be built. Delete the node_modules folder and try again."

if [ -z "$NO_OPEN" ]; then
  ( for _ in $(seq 1 40); do
      curl -s -o /dev/null "http://127.0.0.1:$PORT/api/state" && { open "$URL"; exit 0; }
      sleep 0.25
    done ) &
fi

echo
echo "The Roster Performance Tool is running at $URL"
echo "Keep this window open while you use it. Close it to stop the tool."
echo
PORT="$PORT" npm run start --silent
