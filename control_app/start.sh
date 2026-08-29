#!/bin/sh
set -eu

if [ -f "${TELEMETRIKA_ENV_FILE:-./runtime.env}" ]; then
  set -a
  . "${TELEMETRIKA_ENV_FILE:-./runtime.env}"
  set +a
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-18221}"
export TELEMETRIKA_SETTINGS_PATH="${TELEMETRIKA_SETTINGS_PATH:-./data/settings.json}"

: "${TELEMETRIKA_LOGIN:?Укажите TELEMETRIKA_LOGIN в .env}"
: "${TELEMETRIKA_PASSWORD:?Укажите TELEMETRIKA_PASSWORD в .env}"
: "${TELEMETRIKA_SESSION_SECRET:?Укажите TELEMETRIKA_SESSION_SECRET в .env}"

exec node --experimental-sqlite server.js
