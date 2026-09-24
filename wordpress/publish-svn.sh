#!/usr/bin/env bash
#
# Publishes the plugin to the WordPress.org SVN repository.
#
# ─────────────────────────────────────────────────────────────────────────────
# THIS CANNOT RUN UNTIL THE PLUGIN IS APPROVED
# ─────────────────────────────────────────────────────────────────────────────
# WordPress.org does not let you create a plugin's SVN repository. They create it, once a
# human has reviewed and approved the submission, and email you the URL. Until then there
# is nothing to check out and this script will fail at the first step, correctly.
#
# Submit first: https://wordpress.org/plugins/developers/add/
#
# ─────────────────────────────────────────────────────────────────────────────
# WHAT IT DOES
# ─────────────────────────────────────────────────────────────────────────────
# Checks out the SVN repo, copies the plugin into trunk/, copies the listing artwork into
# assets/, makes a tag, and commits. SVN tags are COPIES of trunk, not references, which is
# the thing that catches people arriving from git.
#
# Usage:
#   ./wordpress/publish-svn.sh 1.0.0
#
set -euo pipefail

VERSION="${1:-}"
SLUG="human-machine-view"
SVN_URL="https://plugins.svn.wordpress.org/${SLUG}"

if [ -z "$VERSION" ]; then
  echo "usage: $0 <version>   e.g. $0 1.0.0" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$HERE/$SLUG"
ASSETS_DIR="$HERE/assets"

command -v svn >/dev/null || { echo "svn is not installed. brew install subversion" >&2; exit 1; }

# The version in the plugin header is what WordPress shows; the Stable tag in readme.txt is
# what it SERVES. Disagreeing versions ship the wrong code with the right number on it.
HEADER_VERSION="$(grep -m1 '^ \* Version:' "$PLUGIN_DIR/$SLUG.php" | awk '{print $3}')"
STABLE_TAG="$(grep -m1 '^Stable tag:' "$PLUGIN_DIR/readme.txt" | awk '{print $3}')"

if [ "$HEADER_VERSION" != "$VERSION" ]; then
  echo "error: plugin header says $HEADER_VERSION, you asked for $VERSION" >&2
  exit 1
fi
if [ "$STABLE_TAG" != "$VERSION" ]; then
  echo "error: readme.txt Stable tag says $STABLE_TAG, you asked for $VERSION" >&2
  echo "       Stable tag decides which version users actually get. Fix it first." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
echo "checking out $SVN_URL"
svn checkout "$SVN_URL" "$WORK/svn" --depth immediates
cd "$WORK/svn"
svn update --set-depth infinity trunk assets 2>/dev/null || true

echo "copying the plugin into trunk/"
rm -rf trunk/*
cp -R "$PLUGIN_DIR/." trunk/

echo "copying listing artwork into assets/"
mkdir -p assets
cp "$ASSETS_DIR"/banner-*.png "$ASSETS_DIR"/icon-*.png "$ASSETS_DIR"/screenshot-*.png assets/

# svn has no `add -A`; anything unversioned has to be added, anything gone has to be deleted.
svn add --force trunk assets --auto-props --parents --depth infinity -q || true
svn status | grep '^!' | awk '{print $2}' | xargs -r svn delete --force -q || true

echo "tagging $VERSION"
if svn info "tags/$VERSION" >/dev/null 2>&1; then
  echo "error: tags/$VERSION already exists. Versions on WordPress.org are immutable." >&2
  exit 1
fi
svn copy trunk "tags/$VERSION"

echo
echo "about to commit:"
svn status
echo
read -r -p "commit and publish $VERSION? [y/N] " answer
[[ "$answer" =~ ^[Yy]$ ]] || { echo "aborted, nothing published"; exit 0; }

svn commit -m "$VERSION"

echo
echo "published. it takes a few minutes to appear at:"
echo "  https://wordpress.org/plugins/$SLUG/"
echo
echo "check the listing renders the banner, the icon and all three screenshots."
