#!/bin/bash
# Startup hook for the palworld container. Runs BEFORE PalServer launches,
# applies any settings the dashboard queued while the server was running, then
# hands off to the image's real entrypoint.
#
# Why this exists: the game engine resaves PalWorldSettings.ini from its
# in-memory state on shutdown, so a write made while the server is up gets
# clobbered. Instead of racing that, the dashboard writes desired changes to a
# separate pending file; this hook applies them here — after the engine's final
# resave, before the next PalServer reads the ini — so there is no race.
#
# Requires DISABLE_GENERATE_SETTINGS=true (the normal locked state): with a
# populated ini, the image's start.sh does not regenerate/overwrite it during
# boot, so our patch survives until PalServer reads it.
set -u

CONFIG_DIR="/palworld/Pal/Saved/Config/LinuxServer"
INI="$CONFIG_DIR/PalWorldSettings.ini"
PENDING="$CONFIG_DIR/pending-settings.txt"

if [ -f "$PENDING" ] && [ -f "$INI" ]; then
    echo "[apply-pending] applying queued settings changes"
    # remember the ini's owner: sed -i writes a temp file as root then renames
    # it over the original, which would flip ownership to root and break the
    # dashboard's (uid 1000) later writes. Restore the original owner afterwards.
    ini_owner="$(stat -c '%u:%g' "$INI" 2>/dev/null || true)"
    while IFS='=' read -r key value; do
        # skip blank lines
        [ -z "${key// /}" ] && continue
        # defense in depth: only touch simple key=value pairs, so a crafted
        # value can't inject into the sed expression or the ini structure
        if [[ "$key" =~ ^[A-Za-z0-9_]+$ ]] && [[ "$value" =~ ^[A-Za-z0-9._-]+$ ]]; then
            # anchor the key on the preceding ( or , so we match a whole field
            # name, never a substring of a longer one
            sed -i -E "s|([(,]${key}=)[^,)]*|\1${value}|" "$INI"
            echo "[apply-pending]   ${key}=${value}"
        else
            echo "[apply-pending]   skipping malformed line: ${key}=${value}"
        fi
    done < "$PENDING"
    [ -n "$ini_owner" ] && chown "$ini_owner" "$INI" 2>/dev/null || true
    rm -f "$PENDING"
fi

# hand off to the image's real entrypoint (replaces this process, so its
# SIGTERM trap becomes PID 1's — graceful shutdown keeps working)
exec /home/steam/server/init.sh
