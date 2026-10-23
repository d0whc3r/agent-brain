package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"qdrant-review-brain/internal/premise"
)

// defaultRoot is the brain repo when BRAIN_ROOT is unset.
const defaultRoot = "/Users/josep/projects/qdrant-review-brain"

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] != "premise" {
		usage(stderr)
		return 1
	}
	return runPremise(args[1:], stdout, stderr)
}

func runPremise(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		usage(stderr)
		return 1
	}
	switch args[0] {
	case "list":
		return cmdList(args[1:], stdout, stderr)
	case "add":
		return cmdAdd(args[1:], stdout, stderr)
	case "show":
		return cmdShow(args[1:], stdout, stderr)
	case "rm":
		return cmdRm(args[1:], stderr)
	case "search":
		return cmdSearch(args[1:], stdout, stderr)
	default:
		usage(stderr)
		return 1
	}
}

func cmdList(args []string, stdout, stderr io.Writer) int {
	repo, code := parseList(args, stderr)
	if code != 0 {
		return code
	}
	store, code := openStore(stderr)
	if code != 0 {
		return code
	}
	items, err := store.List(repo)
	if err != nil {
		return failStore(stderr, err)
	}
	writePremises(stdout, items)
	return 0
}

func cmdAdd(args []string, stdout, stderr io.Writer) int {
	opts, code := parseAdd(args, stderr)
	if code != 0 {
		return code
	}
	store, code := openStore(stderr)
	if code != 0 {
		return code
	}
	added, err := store.Add(premise.Premise{
		ID:       opts.id,
		Text:     opts.text,
		Strength: premise.Strength(opts.strength),
		Repos:    opts.repos,
		Source:   opts.source,
	})
	if err != nil {
		return failStore(stderr, err)
	}
	fmt.Fprintln(stdout, added.ID)
	return 0
}

func cmdShow(args []string, stdout, stderr io.Writer) int {
	id, code := oneArg(args, "show", stderr)
	if code != 0 {
		return code
	}
	store, code := openStore(stderr)
	if code != 0 {
		return code
	}
	item, err := store.Get(id)
	if err != nil {
		return failStore(stderr, err)
	}
	writePremise(stdout, item)
	return 0
}

func cmdRm(args []string, stderr io.Writer) int {
	id, code := oneArg(args, "rm", stderr)
	if code != 0 {
		return code
	}
	store, code := openStore(stderr)
	if code != 0 {
		return code
	}
	if err := store.Delete(id); err != nil {
		return failStore(stderr, err)
	}
	return 0
}

func cmdSearch(args []string, stdout, stderr io.Writer) int {
	query, code := oneArg(args, "search", stderr)
	if code != 0 {
		return code
	}
	store, code := openStore(stderr)
	if code != 0 {
		return code
	}
	items, err := store.Search(query)
	if err != nil {
		return failStore(stderr, err)
	}
	writePremises(stdout, items)
	return 0
}

func parseList(args []string, stderr io.Writer) (string, int) {
	fs := newFlagSet("list", stderr)
	repo := fs.String("repo", "", "repo name")
	if code := parseFlags(fs, args, stderr); code != 0 {
		return "", code
	}
	if fs.NArg() != 0 {
		fmt.Fprintln(stderr, "list takes no text")
		return "", 1
	}
	return *repo, 0
}

type addOpts struct {
	text     string
	strength string
	repos    []string
	id       string
	source   string
}

func parseAdd(args []string, stderr io.Writer) (addOpts, int) {
	fs := newFlagSet("add", stderr)
	strength := fs.String("strength", "", "always, never, or prefer")
	id := fs.String("id", "", "premise id")
	source := fs.String("source", "", "source path")
	var repos stringList
	fs.Var(&repos, "repo", "repo name")
	if code := parseFlags(fs, args, stderr); code != 0 {
		return addOpts{}, code
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(stderr, "add needs one TEXT argument")
		return addOpts{}, 1
	}
	if !validStrength(*strength) {
		fmt.Fprintln(stderr, "add needs --strength always, never, or prefer")
		return addOpts{}, 1
	}
	return addOpts{
		text:     fs.Arg(0),
		strength: *strength,
		repos:    repos,
		id:       *id,
		source:   *source,
	}, 0
}

func validStrength(v string) bool {
	switch premise.Strength(v) {
	case premise.StrengthAlways, premise.StrengthNever, premise.StrengthPrefer:
		return true
	default:
		return false
	}
}

func oneArg(args []string, name string, stderr io.Writer) (string, int) {
	if len(args) != 1 || strings.HasPrefix(args[0], "-") {
		fmt.Fprintf(stderr, "%s needs one argument\n", name)
		return "", 1
	}
	return args[0], 0
}

func openStore(stderr io.Writer) (*premise.Store, int) {
	store, err := premise.Open(brainRoot())
	if err != nil {
		return nil, failStore(stderr, err)
	}
	return store, 0
}

func brainRoot() string {
	if root := os.Getenv("BRAIN_ROOT"); root != "" {
		return root
	}
	return defaultRoot
}

// failStore maps a store error to an exit code.
// A missing id is exit 1. Any other store rejection is exit 2.
func failStore(stderr io.Writer, err error) int {
	fmt.Fprintln(stderr, err)
	if errors.Is(err, os.ErrNotExist) {
		return 1
	}
	return 2
}

func writePremises(w io.Writer, items []premise.Premise) {
	for _, item := range items {
		writePremise(w, item)
	}
}

func writePremise(w io.Writer, item premise.Premise) {
	fmt.Fprintf(w, "%s\t%s\t%s\n", item.ID, item.Strength, item.Text)
}

func usage(w io.Writer) {
	fmt.Fprint(w, `usage:
  brain premise list [--repo name]
  brain premise add TEXT --strength always|never|prefer [--repo name ...] [--id slug] [--source path]
  brain premise show ID
  brain premise rm ID
  brain premise search QUERY
`)
}

// newFlagSet uses ContinueOnError so a bad flag returns 1 instead of exiting 2.
func newFlagSet(name string, stderr io.Writer) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() {
		usage(stderr)
	}
	return fs
}

func parseFlags(fs *flag.FlagSet, args []string, stderr io.Writer) int {
	ordered, err := orderFlags(fs, args)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	if err := fs.Parse(ordered); err != nil {
		return 1
	}
	return 0
}

// orderFlags puts valued flags before positionals.
// flag.Parse stops at the first non-flag, and add puts TEXT first.
func orderFlags(fs *flag.FlagSet, args []string) ([]string, error) {
	valued := map[string]bool{}
	fs.VisitAll(func(f *flag.Flag) {
		valued[f.Name] = true
	})
	var flags, pos []string
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			pos = append(pos, args[i+1:]...)
			break
		}
		name, hasValue, isFlag := splitFlag(arg)
		if !isFlag {
			pos = append(pos, arg)
			continue
		}
		if name == "h" || name == "help" {
			flags = append(flags, arg)
			continue
		}
		if !valued[name] {
			return nil, fmt.Errorf("unknown flag --%s", name)
		}
		flags = append(flags, arg)
		if hasValue {
			continue
		}
		if i+1 >= len(args) {
			return nil, fmt.Errorf("flag --%s needs a value", name)
		}
		i++
		flags = append(flags, args[i])
	}
	return append(flags, pos...), nil
}

func splitFlag(arg string) (string, bool, bool) {
	if len(arg) < 2 || !strings.HasPrefix(arg, "-") {
		return "", false, false
	}
	body := strings.TrimLeft(arg, "-")
	if body == "" {
		return "", false, false
	}
	name, _, hasValue := strings.Cut(body, "=")
	if name == "" {
		return "", false, false
	}
	return name, hasValue, true
}

type stringList []string

func (s *stringList) String() string {
	if s == nil {
		return ""
	}
	return strings.Join(*s, ",")
}

func (s *stringList) Set(v string) error {
	*s = append(*s, v)
	return nil
}
