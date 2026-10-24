# Output helpers for install.sh and uninstall.sh. Source this file before the script changes
# directory, because it counts the step lines of "$0".
# It runs under bash 3.2, the version that macOS ships.

# Colors print only to a terminal, and never when NO_COLOR is set (https://no-color.org).
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  bold=$'\033[1m' dim=$'\033[2m' red=$'\033[31m' green=$'\033[32m' yellow=$'\033[33m' reset=$'\033[0m'
else
  bold='' dim='' red='' green='' yellow='' reset=''
fi

step_total="$(grep -c '^step "' "$0")"
step_count=0
step_name=''
warnings=()

step() {
  step_count=$((step_count + 1))
  step_name="$1"
  printf '\n%s[%d/%d] %s%s\n' "$bold" "$step_count" "$step_total" "$1" "$reset"
}

# short writes the home directory as ~. A tilde in the replacement needs a variable in bash 3.2.
short() {
  local tilde='~'
  printf '%s' "${1//"$HOME"/$tilde}"
}

ok() {
  printf '  %s✓%s %s\n' "$green" "$reset" "$(short "$*")"
}

skip() {
  printf '  %s- %s%s\n' "$dim" "$(short "$*")" "$reset"
}

# warn keeps absolute paths, because a user may paste the fix into a shell, and ~ does not
# expand inside quotes. The summary repeats each warning.
warn() {
  printf '  %s!%s %s\n' "$yellow" "$reset" "$*"
  warnings+=("$*")
}

fail() {
  printf '  %s✗ %s%s\n' "$red" "$(short "$*")" "$reset" >&2
  exit 1
}

# report prints each "STATUS TEXT" line of a node helper with the mark of its status.
report() {
  local line
  while IFS= read -r line; do
    case "$line" in
      rm\ *) ok "removed ${line#rm }" ;;
      updated\ * | removed\ * | *\ items\ in\ *) ok "$line" ;;
      unchanged\ * | skipped\ * | skip\ *) skip "$line" ;;
      *) printf '  %s\n' "$(short "$line")" ;;
    esac
  done
}

# tally reads one type on each line and prints "type count, type count".
tally() {
  sort | uniq -c | awk '{ printf "%s%s %s", sep, $2, $1; sep = ", " }'
}

show_warnings() {
  local warning
  for warning in ${warnings[@]+"${warnings[@]}"}; do
    printf '%s!%s %s\n' "$yellow" "$reset" "$warning"
  done
}

on_exit() {
  local code=$?
  if [ "$code" -eq 0 ]; then
    return
  fi
  printf '\n%s✗ Step %d/%d failed: %s%s\n' "$red$bold" "$step_count" "$step_total" "$step_name" "$reset" >&2
  printf 'Fix the error above, then run %s again. Each step is safe to run again.\n' "$0" >&2
}
trap on_exit EXIT
