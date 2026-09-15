#!/usr/bin/env bash

record_release_assets() {
  local release_dir="$1" asset_dir="${1}/.output/public/assets"
  [[ -d "$asset_dir" ]] || return 0
  (cd "$asset_dir" && find . -type f -print | LC_ALL=C sort) >"${release_dir}/RELEASE_ASSETS"
}

copy_recorded_release_assets() {
  local previous="$1" dest="$2"
  local previous_assets="${previous}/.output/public/assets"
  local dest_assets="${dest}/.output/public/assets"
  [[ -d "$previous_assets" ]] || return 0
  mkdir -p "$dest_assets"

  if [[ ! -f "${previous}/RELEASE_ASSETS" ]]; then
    # One-time compatibility for the release that predates RELEASE_ASSETS.
    cp -a -n "${previous_assets}/." "$dest_assets/"
    return 0
  fi

  local relative source target
  while IFS= read -r relative; do
    [[ "$relative" == ./* && "$relative" != *..* ]] || continue
    source="${previous_assets}/${relative#./}"
    target="${dest_assets}/${relative#./}"
    [[ -f "$source" || -L "$source" ]] || continue
    [[ -e "$target" || -L "$target" ]] && continue
    mkdir -p "$(dirname "$target")"
    cp -a "$source" "$target"
  done <"${previous}/RELEASE_ASSETS"
}

preserve_retained_client_assets() {
  local releases_dir="$1" dest="$2" previous
  [[ -d "$releases_dir" ]] || return 0
  for previous in "$releases_dir"/*; do
    [[ -d "$previous" && "$previous" != "$dest" ]] || continue
    copy_recorded_release_assets "$previous" "$dest"
  done
}
