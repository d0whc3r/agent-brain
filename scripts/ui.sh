# Shared helpers for install.sh and uninstall.sh: options, output, and link checks. Source this
# file before the script changes directory, because it counts the step lines of "$0".
# It runs under bash 3.2, the version that macOS ships.

# Colors print only to a terminal, and never when NO_COLOR is set (https://no-color.org).
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  bold=$'\033[1m' dim=$'\033[2m' red=$'\033[31m' green=$'\033[32m' yellow=$'\033[33m' reset=$'\033[0m'
else
  bold='' dim='' red='' green='' yellow='' reset=''
fi
# On a terminal, a step shows its name while it runs.
tty=0
if [ -t 1 ]; then
  tty=1
fi

step_total="$(grep -c '^step "' "$0")"
step_count=0
step_name=''
step_open=0
# Each line is "KIND TEXT". KIND is change, pass, skip, or warn.
step_lines=()
warnings=()
# Each change is "STATUS TYPE", one for each item, such as "added skills".
changes=()
dry_run=0
change_mark='✓'

# usage prints the comment block at the top of the script.
usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
}

# parse_args reads --dry-run and --help. BRAIN_DRY_RUN tells the node helpers to write nothing.
parse_args() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --dry-run)
        dry_run=1
        change_mark='~'
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        printf 'unknown option: %s\n\n' "$arg" >&2
        usage >&2
        exit 2
        ;;
    esac
  done
  export BRAIN_DRY_RUN="$dry_run"
}

step() {
  end_step
  step_count=$((step_count + 1))
  step_name="$1"
  step_open=1
  step_lines=()
  if [ "$tty" -eq 1 ]; then
    printf '%s[%d/%d] %s …%s' "$dim" "$step_count" "$step_total" "$step_name" "$reset"
  fi
}

# end_step prints the step. A step without a line prints "no change" on its header line, and
# a step with one check or note prints it there. A failed step prints its lines below.
end_step() {
  if [ "$step_open" -eq 0 ]; then
    return
  fi
  step_open=0
  if [ "$tty" -eq 1 ]; then
    printf '\r\033[K'
  fi
  printf '%s[%d/%d] %s%s' "$bold" "$step_count" "$step_total" "$step_name" "$reset"
  local n=${#step_lines[@]} line
  if [ "$n" -eq 0 ] && [ "${1:-}" != failed ]; then
    printf ': %sno change%s\n' "$dim" "$reset"
    return
  fi
  if [ "$n" -eq 1 ] && [ "${1:-}" != failed ]; then
    case "${step_lines[0]}" in
      pass\ *)
        printf ': %s\n' "$(short "${step_lines[0]#* }")"
        return
        ;;
      skip\ *)
        printf ': %s%s%s\n' "$dim" "$(short "${step_lines[0]#* }")" "$reset"
        return
        ;;
    esac
  fi
  printf '\n'
  for line in ${step_lines[@]+"${step_lines[@]}"}; do
    print_line "${line%% *}" "${line#* }"
  done
}

print_line() {
  case "$1" in
    change) printf '  %s%s%s %s\n' "$green" "$change_mark" "$reset" "$(short "$2")" ;;
    pass) printf '  %s✓%s %s\n' "$green" "$reset" "$(short "$2")" ;;
    skip) printf '  %s- %s%s\n' "$dim" "$(short "$2")" "$reset" ;;
    warn) printf '  %s!%s %s\n' "$yellow" "$reset" "$2" ;;
  esac
}

# short writes the home directory as ~. A tilde in the replacement needs a variable in bash 3.2.
short() {
  local tilde='~'
  printf '%s' "${1//"$HOME"/$tilde}"
}

# verb names a status for this run: "added", or "would add" in a dry run.
verb() {
  if [ "$dry_run" -eq 0 ]; then
    printf '%s' "$1"
    return
  fi
  case "$1" in
    added) printf 'would add' ;;
    updated) printf 'would update' ;;
    removed) printf 'would remove' ;;
  esac
}

# change prints "STATUS TEXT" and records COUNT items of TYPE (default 1) for the summary.
# An empty TYPE prints the line, but the summary does not count it.
change() {
  local status="$1" type="$2" text="$3" count="${4:-1}" i
  step_lines+=("change $(verb "$status") $text")
  if [ -z "$type" ]; then
    return
  fi
  for ((i = 0; i < count; i++)); do
    changes+=("$status $type")
  done
}

# pass prints a check that passed. It is not a change.
pass() {
  step_lines+=("pass $*")
}

skip() {
  step_lines+=("skip $*")
}

# warn keeps absolute paths, because a user may paste the fix into a shell, and ~ does not
# expand inside quotes. The summary repeats each warning.
warn() {
  step_lines+=("warn $*")
  warnings+=("$*")
}

fail() {
  end_step failed
  printf '  %s✗ %s%s\n' "$red" "$(short "$*")" "$reset" >&2
  exit 1
}

# report reads the "STATUS TEXT" lines of a node helper. An unchanged line prints nothing.
report() {
  local type="$1" line
  while IFS= read -r line; do
    case "$line" in
      added\ * | updated\ * | removed\ *) change "${line%% *}" "$type" "${line#* }" ;;
      unchanged\ * | '') ;;
      skipped\ *) skip "$line" ;;
      *) pass "$line" ;;
    esac
  done
}

# apply runs a node helper and reports its lines. A failed helper stops the script.
apply() {
  local type="$1" out
  shift
  out="$("$@")"
  report "$type" <<<"$out"
}

# plural prints "1 skill link" or "2 skill links".
plural() {
  if [ "$1" -eq 1 ]; then
    printf '1 %s' "$2"
  else
    printf '%s %ss' "$1" "$2"
  fi
}

# tally reads one type on each line and prints "type count, type count".
tally() {
  sort | uniq -c | awk '{ printf "%s%s %s", sep, $2, $1; sep = ", " }'
}

# tally_of prints the tally of the changes with one status.
tally_of() {
  printf '%s\n' ${changes[@]+"${changes[@]}"} | awk -v s="$1" '$1 == s { print $2 }' | tally
}

# changes_text prints "added agents 4, skills 2; updated hook 1", or nothing.
changes_text() {
  local status part out=''
  for status in added updated removed; do
    part="$(tally_of "$status")"
    if [ -n "$part" ]; then
      out="${out:+$out; }$(verb "$status") $part"
    fi
  done
  printf '%s' "$out"
}

show_warnings() {
  local warning
  for warning in ${warnings[@]+"${warnings[@]}"}; do
    printf '%s!%s %s\n' "$yellow" "$reset" "$warning"
  done
}

# dead_brain_link is true for a brain link whose target is gone: the checkout moved, or a new
# version dropped the item.
dead_brain_link() {
  [ -L "$1" ] && [ ! -e "$1" ] && [[ "$(basename "$1")" == brain* ]]
}

on_exit() {
  local code=$?
  if [ "$code" -eq 0 ]; then
    return
  fi
  end_step failed
  if [ "$step_count" -eq 0 ]; then
    return
  fi
  printf '\n%s✗ Step %d/%d failed: %s%s\n' "$red$bold" "$step_count" "$step_total" "$step_name" "$reset" >&2
  printf 'Fix the error above, then run %s again. Each step is safe to run again.\n' "$0" >&2
}
trap on_exit EXIT
