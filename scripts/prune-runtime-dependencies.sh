#!/usr/bin/env sh
set -eu

node_modules_dir="${1:-node_modules}"
if [ ! -d "$node_modules_dir" ]; then
  echo "node_modules directory not found: $node_modules_dir" >&2
  exit 1
fi

# These files are only useful to editors, type checkers, or debuggers.
find "$node_modules_dir" -type f \( \
  -name '*.map' -o \
  -name '*.d.ts' -o \
  -name '*.d.mts' -o \
  -name '*.d.cts' \
\) -delete

# Keep only the native addon for the linux/amd64 Debian runtime.
for prebuilds in "$node_modules_dir"/.pnpm/argon2@*/node_modules/argon2/prebuilds; do
  [ -d "$prebuilds" ] || continue
  find "$prebuilds" -type f ! -path "$prebuilds/linux-x64/argon2.glibc.node" -delete
  find "$prebuilds" -depth -type d -empty -delete
done
