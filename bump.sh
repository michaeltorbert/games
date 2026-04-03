#!/bin/bash
# Usage: ./bump.sh <game> <version>
# Example: ./bump.sh kayak 1.1.17
set -e

usage() { echo "Usage: $0 <game> <version>  (e.g. $0 kayak 1.1.17)"; exit 1; }
[ $# -ne 2 ] && usage

GAME=$1
V=$2

case $GAME in
  football|kayak|prague) ;;
  *) echo "Unknown game '$GAME'. Must be football, kayak, or prague."; exit 1 ;;
esac

MAIN_JS="$GAME/$GAME.js"
INDEX_HTML="$GAME/index.html"

if [ ! -f "$MAIN_JS" ]; then
  echo "Missing main JS file: $MAIN_JS"
  exit 1
fi

if [ ! -f "$INDEX_HTML" ]; then
  echo "Missing index file: $INDEX_HTML"
  exit 1
fi

if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i '')
fi

sed_in_place() {
  sed "${SED_INPLACE[@]}" "$1" "$2"
}

sed_in_place "s/const GAME_VERSION = '[^']*'/const GAME_VERSION = '$V'/" "$MAIN_JS"
sed_in_place "s/\"$GAME\": \"[^\"]*\"/\"$GAME\": \"$V\"/" version.json
sed_in_place "s/?v=[0-9][0-9.]*/?v=$V/g" "$INDEX_HTML"
sed_in_place "/id: '$GAME'/,/version: '[^']*'/ s/version: '[^']*'/version: '$V'/" games.js

echo "Bumped $GAME -> v$V"
echo "Updated:"
echo "  $MAIN_JS"
echo "  version.json"
echo "  $INDEX_HTML"
echo "  games.js"
