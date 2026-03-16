#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEFAULT_PM="${MIOKU_PM:-bun}"
DEFAULT_WEBUI_SERVICE_REPO="https://github.com/Jerryplusy/mioku-service-webui.git"
DEFAULT_WEBUI_REPO="https://github.com/Jerryplusy/mioku-webui.git"

TMP_DIR=""

log() {
  printf '[mioku-install] %s\n' "$*"
}

warn() {
  printf '[mioku-install] WARN: %s\n' "$*" >&2
}

die() {
  printf '[mioku-install] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [ -n "${TMP_DIR:-}" ] && [ -d "${TMP_DIR}" ]; then
    rm -rf "${TMP_DIR}"
  fi
}

trap cleanup EXIT

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

ensure_tmp_dir() {
  if [ -z "${TMP_DIR}" ]; then
    TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t mioku-install)"
  fi
}

detect_pm() {
  local wanted="$1"
  if [ -n "${wanted}" ] && command_exists "${wanted}"; then
    printf '%s\n' "${wanted}"
    return 0
  fi

  for pm in bun pnpm npm; do
    if command_exists "${pm}"; then
      if [ -n "${wanted}" ]; then
        warn "未找到 ${wanted}，自动使用 ${pm}"
      fi
      printf '%s\n' "${pm}"
      return 0
    fi
  done

  die "未找到可用包管理器（bun/pnpm/npm）"
}

safe_repo_name() {
  local repo="$1"
  local clean="${repo%%\?*}"
  clean="${clean%%#*}"
  clean="${clean%/}"
  clean="${clean##*/}"
  clean="${clean%.git}"

  if [ -z "${clean}" ]; then
    die "无法从仓库地址推断名称: ${repo}"
  fi

  printf '%s\n' "${clean}"
}

clone_or_pull() {
  local repo_url="$1"
  local dest_dir="$2"

  if ! command_exists git; then
    die "未安装 git"
  fi

  if [ -d "${dest_dir}/.git" ]; then
    log "检测到已有仓库，拉取更新: ${dest_dir}"
    git -C "${dest_dir}" pull --ff-only
    return 0
  fi

  if [ -e "${dest_dir}" ]; then
    die "目标目录已存在且不是 git 仓库: ${dest_dir}"
  fi

  mkdir -p "$(dirname "${dest_dir}")"
  log "克隆仓库: ${repo_url}"
  git clone "${repo_url}" "${dest_dir}"
}

install_deps() {
  local dir="$1"
  local pm="$2"
  log "安装依赖: ${dir} (${pm})"
  (
    cd "${dir}"
    "${pm}" install
  )
}

run_js_script() {
  local script_path="$1"
  shift

  if command_exists node; then
    node "${script_path}" "$@"
    return 0
  fi
  if command_exists bun; then
    bun "${script_path}" "$@"
    return 0
  fi
  die "需要 node 或 bun 来更新 JSON 配置"
}

add_plugin_to_config() {
  local plugin_name="$1"
  ensure_tmp_dir

  local js_file="${TMP_DIR}/add-plugin.js"
  cat > "${js_file}" <<'JS'
const fs = require("fs");
const path = require("path");

const rootDir = process.argv[2];
const pluginName = process.argv[3];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function ensurePluginList(container) {
  if (!container || typeof container !== "object") return [];
  if (!Array.isArray(container.plugins)) container.plugins = [];
  return container.plugins;
}

const packageJsonPath = path.join(rootDir, "package.json");
const configPath = path.join(rootDir, "config", "mioku.json");

const pkg = readJson(packageJsonPath, {});
if (!pkg.mioki || typeof pkg.mioki !== "object") pkg.mioki = {};
const pkgPlugins = ensurePluginList(pkg.mioki);
if (!pkgPlugins.includes(pluginName)) pkgPlugins.push(pluginName);
writeJson(packageJsonPath, pkg);

const cfg = readJson(configPath, { mioki: {} });
if (!cfg.mioki || typeof cfg.mioki !== "object") cfg.mioki = {};
const cfgPlugins = ensurePluginList(cfg.mioki);
if (!cfgPlugins.includes(pluginName)) cfgPlugins.push(pluginName);
writeJson(configPath, cfg);
JS

  run_js_script "${js_file}" "${ROOT_DIR}" "${plugin_name}"
}

download_file() {
  local url="$1"
  local output="$2"

  if command_exists curl; then
    curl -fsSL --retry 2 --connect-timeout 20 -o "${output}" "${url}"
    return 0
  fi

  if command_exists wget; then
    wget -q -O "${output}" "${url}"
    return 0
  fi

  die "未找到下载工具（curl 或 wget）"
}

download_github_json() {
  local url="$1"
  local output="$2"

  if command_exists curl; then
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "User-Agent: mioku-installer" \
      -o "${output}" \
      "${url}"
    return 0
  fi

  if command_exists wget; then
    wget -q \
      --header="Accept: application/vnd.github+json" \
      --header="User-Agent: mioku-installer" \
      -O "${output}" \
      "${url}"
    return 0
  fi

  die "未找到下载工具（curl 或 wget）"
}

to_windows_path() {
  local p="$1"
  if command_exists cygpath; then
    cygpath -w "${p}"
  else
    printf '%s\n' "${p}"
  fi
}

extract_zip() {
  local zip_file="$1"
  local dest_dir="$2"
  mkdir -p "${dest_dir}"

  if command_exists unzip; then
    unzip -oq "${zip_file}" -d "${dest_dir}"
    return 0
  fi

  if command_exists bsdtar; then
    bsdtar -xf "${zip_file}" -C "${dest_dir}"
    return 0
  fi

  if command_exists tar; then
    if tar -xf "${zip_file}" -C "${dest_dir}" 2>/dev/null; then
      return 0
    fi
  fi

  if command_exists powershell.exe; then
    local zip_win dest_win
    zip_win="$(to_windows_path "${zip_file}")"
    dest_win="$(to_windows_path "${dest_dir}")"
    powershell.exe -NoProfile -Command "Expand-Archive -LiteralPath '${zip_win}' -DestinationPath '${dest_win}' -Force" >/dev/null
    return 0
  fi

  die "没有可用解压工具（unzip/bsdtar/tar/powershell）"
}

resolve_github_repo_path() {
  local repo_url="$1"
  local clean="${repo_url%.git}"
  clean="${clean#https://github.com/}"
  clean="${clean#http://github.com/}"
  clean="${clean#git@github.com:}"
  clean="${clean#ssh://git@github.com/}"

  if [[ "${clean}" != */* ]]; then
    die "webui 仓库必须是 GitHub 仓库地址: ${repo_url}"
  fi

  printf '%s\n' "${clean}" | awk -F/ '{print $1 "/" $2}'
}

json_first_value() {
  local key="$1"
  local file="$2"
  grep -Eo "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]+\"" "${file}" \
    | sed -E 's/.*"([^"]+)"/\1/' \
    | head -n 1
}

find_webui_asset_url() {
  local json_file="$1"
  local urls

  urls="$(
    grep -Eo '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]+"' "${json_file}" \
      | sed -E 's/.*"([^"]+)"/\1/' || true
  )"

  if [ -z "${urls}" ]; then
    return 1
  fi

  local dist_zip
  dist_zip="$(printf '%s\n' "${urls}" | grep -Ei 'dist.*\.zip$' | head -n 1 || true)"
  if [ -n "${dist_zip}" ]; then
    printf '%s\n' "${dist_zip}"
    return 0
  fi

  local any_zip
  any_zip="$(printf '%s\n' "${urls}" | grep -Ei '\.zip$' | head -n 1 || true)"
  if [ -n "${any_zip}" ]; then
    printf '%s\n' "${any_zip}"
    return 0
  fi

  return 1
}

resolve_dist_source_dir() {
  local unpack_dir="$1"

  if [ -f "${unpack_dir}/index.html" ]; then
    printf '%s\n' "${unpack_dir}"
    return 0
  fi
  if [ -f "${unpack_dir}/dist/index.html" ]; then
    printf '%s\n' "${unpack_dir}/dist"
    return 0
  fi

  local index_path
  index_path="$(find "${unpack_dir}" -type f -name "index.html" | head -n 1 || true)"
  if [ -n "${index_path}" ]; then
    dirname "${index_path}"
    return 0
  fi

  return 1
}

install_plugin() {
  local repo_url="$1"
  local name="$2"
  local wanted_pm="$3"
  local pm
  pm="$(detect_pm "${wanted_pm}")"

  if [ -z "${name}" ]; then
    name="$(safe_repo_name "${repo_url}")"
  fi

  local target="${ROOT_DIR}/plugins/${name}"
  clone_or_pull "${repo_url}" "${target}"
  install_deps "${target}" "${pm}"
  add_plugin_to_config "${name}"

  log "插件安装完成: ${name}"
}

install_service() {
  local repo_url="$1"
  local name="$2"
  local wanted_pm="$3"
  local pm
  pm="$(detect_pm "${wanted_pm}")"

  if [ -z "${name}" ]; then
    name="$(safe_repo_name "${repo_url}")"
  fi

  local target="${ROOT_DIR}/src/services/${name}"
  clone_or_pull "${repo_url}" "${target}"
  install_deps "${target}" "${pm}"

  log "服务安装完成: ${name}"
}

install_webui() {
  local service_repo="$1"
  local webui_repo="$2"
  local release_tag="$3"
  local wanted_pm="$4"
  local skip_service="$5"

  local pm
  pm="$(detect_pm "${wanted_pm}")"

  local webui_service_dir="${ROOT_DIR}/src/services/webui"
  local dist_dir="${webui_service_dir}/dist"

  if [ "${skip_service}" != "true" ]; then
    clone_or_pull "${service_repo}" "${webui_service_dir}"
    install_deps "${webui_service_dir}" "${pm}"
  else
    log "跳过 webui 服务安装"
    mkdir -p "${webui_service_dir}"
  fi

  ensure_tmp_dir
  local repo_path
  repo_path="$(resolve_github_repo_path "${webui_repo}")"

  local api_url=""
  if [ "${release_tag}" = "latest" ]; then
    api_url="https://api.github.com/repos/${repo_path}/releases/latest"
  else
    api_url="https://api.github.com/repos/${repo_path}/releases/tags/${release_tag}"
  fi

  local release_json="${TMP_DIR}/release.json"
  download_github_json "${api_url}" "${release_json}"

  local tag_name
  tag_name="$(json_first_value "tag_name" "${release_json}" || true)"
  if [ -z "${tag_name}" ]; then
    die "未获取到 release 信息，请确认仓库和 tag 是否正确"
  fi

  local asset_url
  asset_url="$(find_webui_asset_url "${release_json}" || true)"
  if [ -z "${asset_url}" ]; then
    die "release 未找到 zip 资产，请确认已上传 dist 压缩包"
  fi

  local asset_file="${TMP_DIR}/webui-dist.zip"
  local unpack_dir="${TMP_DIR}/unpack"

  log "下载 webui dist: ${asset_url}"
  download_file "${asset_url}" "${asset_file}"

  log "解压 webui dist"
  extract_zip "${asset_file}" "${unpack_dir}"

  local source_dir
  source_dir="$(resolve_dist_source_dir "${unpack_dir}" || true)"
  if [ -z "${source_dir}" ]; then
    die "解压后未找到可用 dist 内容（缺少 index.html）"
  fi

  rm -rf "${dist_dir}"
  mkdir -p "${dist_dir}"
  cp -R "${source_dir}/." "${dist_dir}/"

  local version="${tag_name#v}"
  printf '%s\n' "${version}" > "${dist_dir}/.webui-version"
  printf '{"version":"%s"}\n' "${version}" > "${dist_dir}/webui-version.json"

  log "WebUI 安装完成: ${version}"
  log "服务目录: ${webui_service_dir}"
  log "dist 目录: ${dist_dir}"
}

usage() {
  cat <<'EOF'
用法:
  ./install-mioku.sh plugin <repo-url> [--name NAME] [--pm bun|pnpm|npm]
  ./install-mioku.sh service <repo-url> [--name NAME] [--pm bun|pnpm|npm]
  ./install-mioku.sh webui [--pm bun|pnpm|npm] [--service-repo URL] [--webui-repo URL] [--tag latest|vX.Y.Z] [--skip-service]
  ./install-mioku.sh help

示例:
  ./install-mioku.sh plugin https://github.com/you/your-plugin.git
  ./install-mioku.sh service https://github.com/you/your-service.git --pm pnpm
  ./install-mioku.sh webui
  ./install-mioku.sh webui --tag v1.4.0
EOF
}

parse_plugin_or_service_args() {
  local mode="$1"
  shift

  local repo_url=""
  local name=""
  local pm="${DEFAULT_PM}"

  while [ $# -gt 0 ]; do
    case "$1" in
      --name)
        [ $# -ge 2 ] || die "--name 缺少参数"
        name="$2"
        shift 2
        ;;
      --pm)
        [ $# -ge 2 ] || die "--pm 缺少参数"
        pm="$2"
        shift 2
        ;;
      -*)
        die "未知参数: $1"
        ;;
      *)
        if [ -z "${repo_url}" ]; then
          repo_url="$1"
          shift
        else
          die "多余参数: $1"
        fi
        ;;
    esac
  done

  [ -n "${repo_url}" ] || die "${mode} 需要 repo-url"

  if [ "${mode}" = "plugin" ]; then
    install_plugin "${repo_url}" "${name}" "${pm}"
  else
    install_service "${repo_url}" "${name}" "${pm}"
  fi
}

parse_webui_args() {
  local pm="${DEFAULT_PM}"
  local service_repo="${DEFAULT_WEBUI_SERVICE_REPO}"
  local webui_repo="${DEFAULT_WEBUI_REPO}"
  local tag="latest"
  local skip_service="false"

  while [ $# -gt 0 ]; do
    case "$1" in
      --pm)
        [ $# -ge 2 ] || die "--pm 缺少参数"
        pm="$2"
        shift 2
        ;;
      --service-repo)
        [ $# -ge 2 ] || die "--service-repo 缺少参数"
        service_repo="$2"
        shift 2
        ;;
      --webui-repo)
        [ $# -ge 2 ] || die "--webui-repo 缺少参数"
        webui_repo="$2"
        shift 2
        ;;
      --tag)
        [ $# -ge 2 ] || die "--tag 缺少参数"
        tag="$2"
        shift 2
        ;;
      --skip-service)
        skip_service="true"
        shift
        ;;
      -*)
        die "未知参数: $1"
        ;;
      *)
        die "多余参数: $1"
        ;;
    esac
  done

  install_webui "${service_repo}" "${webui_repo}" "${tag}" "${pm}" "${skip_service}"
}

main() {
  cd "${ROOT_DIR}"
  local cmd="${1:-help}"
  shift || true

  case "${cmd}" in
    plugin)
      parse_plugin_or_service_args "plugin" "$@"
      ;;
    service)
      parse_plugin_or_service_args "service" "$@"
      ;;
    webui)
      parse_webui_args "$@"
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      die "未知命令: ${cmd}"
      ;;
  esac
}

main "$@"
