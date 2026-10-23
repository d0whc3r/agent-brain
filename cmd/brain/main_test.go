package main

import (
	"bytes"
	"strings"
	"testing"
)

func invoke(t *testing.T, args ...string) (int, string, string) {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := run(args, &stdout, &stderr)
	return code, stdout.String(), stderr.String()
}

func TestCLIAddListRm(t *testing.T) {
	t.Setenv("BRAIN_ROOT", t.TempDir())

	code, _, errOut := invoke(t, "premise", "add", "New RPC lands in cluster-service", "--strength", "always", "--repo", "qdrant-cloud-cluster-service")
	if code != 0 {
		t.Fatalf("add exit %d: %s", code, errOut)
	}

	code, listOut, errOut := invoke(t, "premise", "list")
	if code != 0 {
		t.Fatalf("list exit %d: %s", code, errOut)
	}
	want := "new-rpc-lands-in-cluster-service\talways\tNew RPC lands in cluster-service\n"
	if listOut != want {
		t.Fatalf("list = %q, want %q", listOut, want)
	}

	code, listOut, errOut = invoke(t, "premise", "list", "--repo", "qdrant-cloud-cluster-service")
	if code != 0 {
		t.Fatalf("list repo exit %d: %s", code, errOut)
	}
	if listOut != want {
		t.Fatalf("list repo = %q, want %q", listOut, want)
	}
	code, listOut, errOut = invoke(t, "premise", "list", "--repo", "qdrant-cloud-ui")
	if code != 0 {
		t.Fatalf("list other exit %d: %s", code, errOut)
	}
	if listOut != "" {
		t.Fatalf("list other = %q, want empty", listOut)
	}

	code, _, errOut = invoke(t, "premise", "rm", "new-rpc-lands-in-cluster-service")
	if code != 0 {
		t.Fatalf("rm exit %d: %s", code, errOut)
	}

	code, listOut, errOut = invoke(t, "premise", "list")
	if code != 0 {
		t.Fatalf("list after rm exit %d: %s", code, errOut)
	}
	if strings.Contains(listOut, "New RPC lands in cluster-service") {
		t.Fatalf("list after rm = %q, want the premise omitted", listOut)
	}
}

func TestCLIMissingID(t *testing.T) {
	t.Setenv("BRAIN_ROOT", t.TempDir())

	code, _, errOut := invoke(t, "premise", "show", "missing-id")
	if code != 1 {
		t.Fatalf("show exit = %d, want 1: %s", code, errOut)
	}
	code, _, errOut = invoke(t, "premise", "rm", "missing-id")
	if code != 1 {
		t.Fatalf("rm exit = %d, want 1: %s", code, errOut)
	}
	code, _, errOut = invoke(t, "premise", "show")
	if code != 1 {
		t.Fatalf("show with no id exit = %d, want 1: %s", code, errOut)
	}
}

func TestBrainRoot(t *testing.T) {
	t.Setenv("BRAIN_ROOT", "")
	if brainRoot() != "/Users/josep/projects/qdrant-review-brain" {
		t.Fatalf("root = %q", brainRoot())
	}
	t.Setenv("BRAIN_ROOT", "/tmp/brain-root-test")
	if brainRoot() != "/tmp/brain-root-test" {
		t.Fatalf("root = %q", brainRoot())
	}
}

func TestCLISecretExitCode(t *testing.T) {
	t.Setenv("BRAIN_ROOT", t.TempDir())

	code, _, errOut := invoke(t, "premise", "add", "api_key=abcdefghij123456", "--strength", "never")
	if code != 2 {
		t.Fatalf("exit = %d, want 2: %s", code, errOut)
	}
}
