package premise

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type Strength string // "always" | "never" | "prefer"
type Status string   // "active" | "dropped"

const (
	StrengthAlways Strength = "always"
	StrengthNever  Strength = "never"
	StrengthPrefer Strength = "prefer"

	StatusActive  Status = "active"
	StatusDropped Status = "dropped"
)

type Premise struct {
	ID       string
	Text     string
	Strength Strength
	Repos    []string
	Status   Status
	Source   string
}

// Store reads and writes premise markdown files under memory/.
type Store struct {
	root string
}

// idPattern is the only accepted premise id. It cannot contain a path separator.
var idPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// secretText matches a credential assignment. The store must not write it.
var secretText = regexp.MustCompile(`(?i)(api[_-]?key|token|secret|authorization)\s*[:=]\s*\S{8,}`)

func Open(root string) (*Store, error) {
	for _, dir := range []string{"premises", "dropped"} {
		path := filepath.Join(root, "memory", dir)
		if err := os.MkdirAll(path, 0o755); err != nil {
			return nil, err
		}
	}
	return &Store{root: root}, nil
}

func (s *Store) List(repo string) ([]Premise, error) {
	dir := filepath.Join(s.root, "memory", "premises")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	out := []Premise{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".md")
		if err := validateID(id); err != nil {
			return nil, fmt.Errorf("premise file %s: %w", entry.Name(), err)
		}
		p, err := readPremise(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, err
		}
		p.ID = id
		if p.Status != StatusActive {
			continue
		}
		if !matchesRepo(p, repo) {
			continue
		}
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].ID < out[j].ID
	})
	return out, nil
}

func (s *Store) Get(id string) (Premise, error) {
	path, err := s.filePath("premises", id)
	if err != nil {
		return Premise{}, err
	}
	p, err := readPremise(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Premise{}, fmt.Errorf("premise %q not found: %w", id, err)
		}
		return Premise{}, err
	}
	p.ID = id
	return p, nil
}

func (s *Store) Add(p Premise) (Premise, error) {
	if err := rejectSecret(p.Text); err != nil {
		return Premise{}, err
	}
	if p.ID == "" {
		p.ID = slug(p.Text)
	}
	if err := validateID(p.ID); err != nil {
		return Premise{}, err
	}
	if p.Status == "" {
		p.Status = StatusActive
	}
	if p.Repos == nil {
		p.Repos = []string{}
	}
	path, err := s.filePath("premises", p.ID)
	if err != nil {
		return Premise{}, err
	}
	_, err = os.Stat(path)
	if err == nil {
		return Premise{}, fmt.Errorf("premise %q already exists", p.ID)
	}
	if !os.IsNotExist(err) {
		return Premise{}, err
	}
	if err := writePremise(path, p); err != nil {
		return Premise{}, err
	}
	return p, nil
}

func (s *Store) Update(id string, p Premise) (Premise, error) {
	if err := rejectSecret(p.Text); err != nil {
		return Premise{}, err
	}
	path, err := s.filePath("premises", id)
	if err != nil {
		return Premise{}, err
	}
	if _, err := readPremise(path); err != nil {
		if os.IsNotExist(err) {
			return Premise{}, fmt.Errorf("premise %q not found: %w", id, err)
		}
		return Premise{}, err
	}
	p.ID = id
	if p.Status == "" {
		p.Status = StatusActive
	}
	if p.Repos == nil {
		p.Repos = []string{}
	}
	if err := writePremise(path, p); err != nil {
		return Premise{}, err
	}
	return p, nil
}

func (s *Store) Delete(id string) error {
	path, err := s.filePath("premises", id)
	if err != nil {
		return err
	}
	p, err := readPremise(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("premise %q not found: %w", id, err)
		}
		return err
	}
	p.ID = id
	p.Status = StatusDropped
	dropped, err := s.filePath("dropped", id)
	if err != nil {
		return err
	}
	if err := writePremise(dropped, p); err != nil {
		return err
	}
	return os.Remove(path)
}

func (s *Store) Search(query string) ([]Premise, error) {
	all, err := s.List("")
	if err != nil {
		return nil, err
	}
	q := strings.ToLower(query)
	out := []Premise{}
	for _, p := range all {
		if strings.Contains(strings.ToLower(p.Text), q) {
			out = append(out, p)
		}
	}
	return out, nil
}

func (s *Store) filePath(dir, id string) (string, error) {
	if err := validateID(id); err != nil {
		return "", err
	}
	return filepath.Join(s.root, "memory", dir, id+".md"), nil
}

func validateID(id string) error {
	if !idPattern.MatchString(id) {
		return fmt.Errorf("invalid id %q", id)
	}
	return nil
}

func rejectSecret(text string) error {
	if secretText.MatchString(text) || strings.Contains(text, "BEGIN PRIVATE KEY") {
		return fmt.Errorf("premise text looks like a secret")
	}
	return nil
}

func slug(text string) string {
	var b strings.Builder
	prevHyphen := false
	for _, r := range strings.ToLower(text) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevHyphen = false
			continue
		}
		if b.Len() == 0 || prevHyphen {
			continue
		}
		b.WriteByte('-')
		prevHyphen = true
	}
	return strings.TrimRight(b.String(), "-")
}

func matchesRepo(p Premise, repo string) bool {
	if repo == "" {
		return true
	}
	for _, name := range p.Repos {
		if name == repo || name == "*" {
			return true
		}
	}
	return false
}

func writePremise(path string, p Premise) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".premise-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	done := false
	defer func() {
		if !done {
			os.Remove(name)
		}
	}()
	if _, err := tmp.WriteString(formatPremise(p)); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o644); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(name, path); err != nil {
		return err
	}
	done = true
	return nil
}

func readPremise(path string) (Premise, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Premise{}, err
	}
	return parseFrontmatter(data)
}

func formatPremise(p Premise) string {
	var b strings.Builder
	b.WriteString("---\n")
	fmt.Fprintf(&b, "id: %s\n", quoteYAML(p.ID))
	fmt.Fprintf(&b, "text: %s\n", quoteYAML(p.Text))
	fmt.Fprintf(&b, "strength: %s\n", quoteYAML(string(p.Strength)))
	b.WriteString("repos:\n")
	for _, repo := range p.Repos {
		fmt.Fprintf(&b, "  - %s\n", quoteYAML(repo))
	}
	fmt.Fprintf(&b, "status: %s\n", quoteYAML(string(p.Status)))
	fmt.Fprintf(&b, "source: %s\n", quoteYAML(p.Source))
	b.WriteString("---\n")
	return b.String()
}

func quoteYAML(v string) string {
	if v == "" {
		return `""`
	}
	if yamlSafe(v) {
		return v
	}
	return strconv.Quote(v)
}

func yamlSafe(v string) bool {
	if v != strings.TrimSpace(v) {
		return false
	}
	if strings.ContainsAny(v, ":#\"'`&*!%@{[|>\n\r\t") {
		return false
	}
	if strings.HasPrefix(v, "-") || strings.HasPrefix(v, "?") {
		return false
	}
	switch strings.ToLower(v) {
	case "true", "false", "null", "yes", "no", "~":
		return false
	}
	return true
}

func parseFrontmatter(data []byte) (Premise, error) {
	text := strings.ReplaceAll(string(data), "\r\n", "\n")
	lines := strings.Split(text, "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return Premise{}, fmt.Errorf("missing frontmatter")
	}
	var body []string
	closed := false
	for _, line := range lines[1:] {
		if strings.TrimSpace(line) == "---" {
			closed = true
			break
		}
		body = append(body, line)
	}
	if !closed {
		return Premise{}, fmt.Errorf("missing frontmatter end")
	}
	return parseFields(body)
}

func parseFields(lines []string) (Premise, error) {
	var p Premise
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if strings.TrimSpace(line) == "" {
			continue
		}
		key, val, ok := strings.Cut(line, ":")
		if !ok {
			return Premise{}, fmt.Errorf("bad frontmatter line %q", line)
		}
		key = strings.TrimSpace(key)
		val = strings.TrimSpace(val)
		if key == "repos" && val == "" {
			for i+1 < len(lines) {
				item, ok := listItem(lines[i+1])
				if !ok {
					break
				}
				p.Repos = append(p.Repos, parseScalar(item))
				i++
			}
			continue
		}
		if key == "repos" {
			p.Repos = []string{parseScalar(val)}
			continue
		}
		switch key {
		case "id":
			p.ID = parseScalar(val)
		case "text":
			p.Text = parseScalar(val)
		case "strength":
			p.Strength = Strength(parseScalar(val))
		case "status":
			p.Status = Status(parseScalar(val))
		case "source":
			p.Source = parseScalar(val)
		}
	}
	if p.Repos == nil {
		p.Repos = []string{}
	}
	return p, nil
}

func listItem(line string) (string, bool) {
	if strings.HasPrefix(line, "  - ") {
		return strings.TrimPrefix(line, "  - "), true
	}
	if strings.HasPrefix(line, "- ") {
		return strings.TrimPrefix(line, "- "), true
	}
	return "", false
}

func parseScalar(raw string) string {
	raw = strings.TrimSpace(raw)
	if len(raw) >= 2 && raw[0] == '"' && raw[len(raw)-1] == '"' {
		unquoted, err := strconv.Unquote(raw)
		if err == nil {
			return unquoted
		}
	}
	if len(raw) >= 2 && raw[0] == '\'' && raw[len(raw)-1] == '\'' {
		return strings.ReplaceAll(raw[1:len(raw)-1], "''", "'")
	}
	return raw
}
