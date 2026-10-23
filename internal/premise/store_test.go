package premise

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func openStore(t *testing.T) (*Store, string) {
	t.Helper()
	root := t.TempDir()
	store, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	return store, root
}

func countFiles(t *testing.T, root string) int {
	t.Helper()
	n := 0
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			n++
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func filesOutsideMemory(t *testing.T, root string) []string {
	t.Helper()
	var out []string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		if rel == "memory" || strings.HasPrefix(rel, "memory"+string(os.PathSeparator)) {
			return nil
		}
		out = append(out, rel)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestAddAndList(t *testing.T) {
	store, root := openStore(t)
	added, err := store.Add(Premise{
		Text:     "New RPC lands in cluster-service",
		Strength: "always",
		Repos:    []string{"qdrant-cloud-cluster-service"},
		Status:   "active",
	})
	if err != nil {
		t.Fatal(err)
	}
	if added.ID != "new-rpc-lands-in-cluster-service" {
		t.Fatalf("id = %q", added.ID)
	}
	keep := filepath.Join(root, "memory", "premises", ".gitkeep")
	if err := os.WriteFile(keep, nil, 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := store.List("")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	if got[0].Text != "New RPC lands in cluster-service" {
		t.Fatalf("text = %q", got[0].Text)
	}
}

func TestDeleteMovesAndHides(t *testing.T) {
	store, root := openStore(t)
	added, err := store.Add(Premise{
		Text:     "New RPC lands in cluster-service",
		Strength: "always",
		Repos:    []string{"qdrant-cloud-cluster-service"},
		Status:   "active",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Delete(added.ID); err != nil {
		t.Fatal(err)
	}

	got, err := store.List("")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("len = %d, want 0", len(got))
	}

	dropped := filepath.Join(root, "memory", "dropped", added.ID+".md")
	data, err := os.ReadFile(dropped)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "\nstatus: dropped\n") {
		t.Fatalf("status missing in %s", data)
	}
	active := filepath.Join(root, "memory", "premises", added.ID+".md")
	if _, err := os.Stat(active); !os.IsNotExist(err) {
		t.Fatalf("active file remains: %v", err)
	}
}

func TestListRepoFilter(t *testing.T) {
	store, _ := openStore(t)
	_, err := store.Add(Premise{
		ID:       "all-repos",
		Text:     "Applies to every repo",
		Strength: "always",
		Repos:    []string{"*"},
		Status:   "active",
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.Add(Premise{
		ID:       "cluster-only",
		Text:     "New RPC lands in cluster-service",
		Strength: "always",
		Repos:    []string{"qdrant-cloud-cluster-service"},
		Status:   "active",
	})
	if err != nil {
		t.Fatal(err)
	}

	got, err := store.List("qdrant-cloud-ui")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	if got[0].ID != "all-repos" {
		t.Fatalf("id = %q", got[0].ID)
	}
	if len(got[0].Repos) != 1 || got[0].Repos[0] != "*" {
		t.Fatalf("repos = %#v", got[0].Repos)
	}
}

func TestRejectPathID(t *testing.T) {
	store, root := openStore(t)
	_, err := store.Add(Premise{
		ID:       "../dropped",
		Text:     "Path escape",
		Strength: "never",
		Repos:    []string{"*"},
		Status:   "active",
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if outside := filesOutsideMemory(t, root); len(outside) != 0 {
		t.Fatalf("files outside memory/: %v", outside)
	}
	if n := countFiles(t, root); n != 0 {
		t.Fatalf("wrote %d files", n)
	}
}

func TestRejectSecretText(t *testing.T) {
	store, root := openStore(t)
	_, err := store.Add(Premise{
		Text:     "api_key=abcdefghij123456",
		Strength: "never",
		Repos:    []string{"*"},
		Status:   "active",
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if n := countFiles(t, root); n != 0 {
		t.Fatalf("wrote %d files", n)
	}
}

func TestSearch(t *testing.T) {
	store, _ := openStore(t)
	_, err := store.Add(Premise{
		Text:     "New RPC lands in Cluster-Service",
		Strength: "always",
		Repos:    []string{"qdrant-cloud-cluster-service"},
		Status:   "active",
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.Add(Premise{
		Text:     "Keep handlers small",
		Strength: "prefer",
		Repos:    []string{"*"},
		Status:   "active",
	})
	if err != nil {
		t.Fatal(err)
	}

	got, err := store.Search("cluster-service")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	if got[0].Text != "New RPC lands in Cluster-Service" {
		t.Fatalf("text = %q", got[0].Text)
	}
}

func TestReadExampleFile(t *testing.T) {
	store, root := openStore(t)
	body := "---\n" +
		"id: new-rpc-cluster-service\n" +
		"text: New RPC lands in cluster-service\n" +
		"strength: always\n" +
		"repos:\n" +
		"  - qdrant-cloud-cluster-service\n" +
		"status: active\n" +
		"source: \"\"\n" +
		"---\n" +
		"\n" +
		"Replace the sample values. Do not commit secrets.\n"
	path := filepath.Join(root, "memory", "premises", "new-rpc-cluster-service.md")
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := store.Get("new-rpc-cluster-service")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "new-rpc-cluster-service" {
		t.Fatalf("id = %q", got.ID)
	}
	if got.Text != "New RPC lands in cluster-service" {
		t.Fatalf("text = %q", got.Text)
	}
	if got.Strength != "always" || got.Status != "active" {
		t.Fatalf("got = %#v", got)
	}
	if len(got.Repos) != 1 || got.Repos[0] != "qdrant-cloud-cluster-service" {
		t.Fatalf("repos = %#v", got.Repos)
	}
	if got.Source != "" {
		t.Fatalf("source = %q", got.Source)
	}
}

func TestGet(t *testing.T) {
	store, _ := openStore(t)
	_, err := store.Add(Premise{
		ID:       "new-rpc-cluster-service",
		Text:     "New RPC lands in cluster-service",
		Strength: "always",
		Repos:    []string{"qdrant-cloud-cluster-service"},
		Status:   "active",
		Source:   "memory/decisions/2026-10-23-example.md",
	})
	if err != nil {
		t.Fatal(err)
	}

	got, err := store.Get("new-rpc-cluster-service")
	if err != nil {
		t.Fatal(err)
	}
	if got.Text != "New RPC lands in cluster-service" {
		t.Fatalf("text = %q", got.Text)
	}
	if got.Strength != "always" {
		t.Fatalf("strength = %q", got.Strength)
	}
	if got.Source != "memory/decisions/2026-10-23-example.md" {
		t.Fatalf("source = %q", got.Source)
	}
	if _, err := store.Get("missing-premise"); err == nil {
		t.Fatal("expected error")
	}
}

func TestUpdateKeepsID(t *testing.T) {
	store, root := openStore(t)
	_, err := store.Add(Premise{
		ID:       "keep-id",
		Text:     "Old text",
		Strength: "always",
		Repos:    []string{"*"},
		Status:   "active",
	})
	if err != nil {
		t.Fatal(err)
	}

	updated, err := store.Update("keep-id", Premise{
		ID:       "other-id",
		Text:     "New text",
		Strength: "never",
		Repos:    []string{"qdrant-cloud-ui"},
		Status:   "active",
		Source:   "memory/decisions/note.md",
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.ID != "keep-id" {
		t.Fatalf("id = %q", updated.ID)
	}
	if updated.Text != "New text" {
		t.Fatalf("text = %q", updated.Text)
	}

	got, err := store.Get("keep-id")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "keep-id" || got.Text != "New text" || got.Strength != "never" {
		t.Fatalf("got = %#v", got)
	}
	other := filepath.Join(root, "memory", "premises", "other-id.md")
	if _, err := os.Stat(other); !os.IsNotExist(err) {
		t.Fatalf("update wrote a new id: %v", err)
	}
}

func TestAddCollision(t *testing.T) {
	store, _ := openStore(t)
	first := Premise{
		Text:     "New RPC lands in cluster-service",
		Strength: "always",
		Repos:    []string{"qdrant-cloud-cluster-service"},
		Status:   "active",
	}
	if _, err := store.Add(first); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Add(first); err == nil {
		t.Fatal("expected collision error")
	}
	got, err := store.List("")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
}

func TestRejectPrivateKey(t *testing.T) {
	store, root := openStore(t)
	_, err := store.Add(Premise{
		Text:     "-----BEGIN PRIVATE KEY-----",
		Strength: "never",
		Repos:    []string{"*"},
		Status:   "active",
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if n := countFiles(t, root); n != 0 {
		t.Fatalf("wrote %d files", n)
	}
}
