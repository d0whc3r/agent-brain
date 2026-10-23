package main

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPAddAndList(t *testing.T) {
	t.Setenv("BRAIN_ROOT", t.TempDir())

	ctx := context.Background()
	server := newPremiseMCP()
	clientTransport, serverTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = serverSession.Close() })

	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "v0.0.1"}, nil)
	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = session.Close() })

	addRes, err := session.CallTool(ctx, &mcp.CallToolParams{
		Name: "premise_add",
		Arguments: map[string]any{
			"text":     "New RPC lands in cluster-service",
			"strength": "always",
			"repos":    []string{"qdrant-cloud-cluster-service"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if addRes.IsError {
		t.Fatalf("premise_add error: %s", toolText(t, addRes))
	}

	listRes, err := session.CallTool(ctx, &mcp.CallToolParams{
		Name:      "premise_list",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatal(err)
	}
	if listRes.IsError {
		t.Fatalf("premise_list error: %s", toolText(t, listRes))
	}

	var items []struct {
		ID       string   `json:"id"`
		Text     string   `json:"text"`
		Strength string   `json:"strength"`
		Repos    []string `json:"repos"`
		Status   string   `json:"status"`
	}
	if err := json.Unmarshal([]byte(toolText(t, listRes)), &items); err != nil {
		t.Fatalf("premise_list JSON: %v\n%s", err, toolText(t, listRes))
	}
	if len(items) != 1 {
		t.Fatalf("premise_list = %d premises, want 1", len(items))
	}
	got := items[0]
	if got.ID != "new-rpc-lands-in-cluster-service" {
		t.Fatalf("id = %q", got.ID)
	}
	if got.Text != "New RPC lands in cluster-service" {
		t.Fatalf("text = %q", got.Text)
	}
	if got.Strength != "always" {
		t.Fatalf("strength = %q", got.Strength)
	}
	if got.Status != "active" {
		t.Fatalf("status = %q", got.Status)
	}
	if len(got.Repos) != 1 || got.Repos[0] != "qdrant-cloud-cluster-service" {
		t.Fatalf("repos = %v", got.Repos)
	}
}

func toolText(t *testing.T, res *mcp.CallToolResult) string {
	t.Helper()
	if len(res.Content) == 0 {
		t.Fatal("tool returned no content")
	}
	text, ok := res.Content[0].(*mcp.TextContent)
	if !ok {
		t.Fatalf("content type %T, want text", res.Content[0])
	}
	return text.Text
}
