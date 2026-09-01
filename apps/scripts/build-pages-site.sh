#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
destination="${1:-}"

if [[ -z "${destination}" || "${destination}" == "/" ]]; then
  echo "公開先ディレクトリを明示してください。" >&2
  exit 1
fi

mkdir -p "${destination}/apps" "${destination}/shared"
cp "${repo_root}/apps/pages-root-index.html" "${destination}/index.html"
touch "${destination}/.nojekyll"

for app in account-console ordercase pmo shiftbuilder; do
  mkdir -p "${destination}/apps/${app}"
  find "${repo_root}/apps/${app}" -maxdepth 1 -type f -name '*.html' \
    -exec cp '{}' "${destination}/apps/${app}/" ';'
  cp -R "${repo_root}/apps/${app}/css" "${destination}/apps/${app}/css"
  cp -R "${repo_root}/apps/${app}/js" "${destination}/apps/${app}/js"
done

mkdir -p "${destination}/apps/persona-gacha"
cp "${repo_root}/apps/persona-gacha/index.html" "${destination}/apps/persona-gacha/index.html"
cp "${repo_root}/apps/persona-gacha/student.html" "${destination}/apps/persona-gacha/student.html"
cp -R "${repo_root}/apps/persona-gacha/css" "${destination}/apps/persona-gacha/css"
cp -R "${repo_root}/apps/persona-gacha/js" "${destination}/apps/persona-gacha/js"

cp -R "${repo_root}/apps/common" "${destination}/apps/common"
cp -R "${repo_root}/apps/theme" "${destination}/apps/theme"
cp -R "${repo_root}/shared/css" "${destination}/shared/css"
cp -R "${repo_root}/shared/js" "${destination}/shared/js"
