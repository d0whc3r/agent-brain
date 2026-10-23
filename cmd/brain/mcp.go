package main

import (
	"context"
	"fmt"
	"io"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"qdrant-review-brain/internal/premise"
)

// cmdMCP serves brain mcp on stdio. Extra arguments are a usage error.
func cmdMCP(args []string, stderr io.Writer) int {
	if len(args) != 0 {
		usage(stderr)
		return 1
	}
	if err := serveMCP(context.Background()); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}

// serveMCP runs the premise server until the client closes stdin.
func serveMCP(ctx context.Context) error {
	return newPremiseMCP().Run(ctx, &mcp.StdioTransport{})
}

// newPremiseMCP registers the six premise tools. Each tool calls the premise store.
func newPremiseMCP() *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "brain-premises",
		Version: "0.1.0",
	}, nil)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "premise_list",
		Description: "List active premises. An empty repo lists every premise.",
	}, toolList)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "premise_get",
		Description: "Get one premise by id.",
	}, toolGet)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "premise_add",
		Description: "Add a premise.",
	}, toolAdd)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "premise_update",
		Description: "Replace one premise.",
	}, toolUpdate)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "premise_delete",
		Description: "Drop a premise by id.",
	}, toolDelete)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "premise_search",
		Description: "Find premises whose text contains the query.",
	}, toolSearch)
	return server
}

type listArgs struct {
	Repo string `json:"repo,omitempty" jsonschema:"repo name. Empty lists every active premise."`
}

type idArgs struct {
	ID string `json:"id" jsonschema:"premise id"`
}

type searchArgs struct {
	Query string `json:"query" jsonschema:"text to find in premise text"`
}

type addArgs struct {
	ID       string   `json:"id,omitempty" jsonschema:"premise id. Empty uses a slug of the text."`
	Text     string   `json:"text" jsonschema:"one sentence"`
	Strength string   `json:"strength" jsonschema:"always, never, or prefer"`
	Repos    []string `json:"repos,omitempty" jsonschema:"repo names"`
	Status   string   `json:"status,omitempty" jsonschema:"active or dropped"`
	Source   string   `json:"source,omitempty" jsonschema:"source path"`
}

type updateArgs struct {
	ID       string   `json:"id" jsonschema:"premise id"`
	Text     string   `json:"text" jsonschema:"one sentence"`
	Strength string   `json:"strength" jsonschema:"always, never, or prefer"`
	Repos    []string `json:"repos,omitempty" jsonschema:"repo names"`
	Status   string   `json:"status,omitempty" jsonschema:"active or dropped"`
	Source   string   `json:"source,omitempty" jsonschema:"source path"`
}

type premiseOut struct {
	ID       string   `json:"id"`
	Text     string   `json:"text"`
	Strength string   `json:"strength"`
	Repos    []string `json:"repos"`
	Status   string   `json:"status"`
	Source   string   `json:"source"`
}

func toolList(_ context.Context, _ *mcp.CallToolRequest, in listArgs) (*mcp.CallToolResult, []premiseOut, error) {
	store, err := premise.Open(brainRoot())
	if err != nil {
		return nil, nil, err
	}
	items, err := store.List(in.Repo)
	if err != nil {
		return nil, nil, err
	}
	return nil, premisesOut(items), nil
}

func toolGet(_ context.Context, _ *mcp.CallToolRequest, in idArgs) (*mcp.CallToolResult, premiseOut, error) {
	store, err := premise.Open(brainRoot())
	if err != nil {
		return nil, premiseOut{}, err
	}
	item, err := store.Get(in.ID)
	if err != nil {
		return nil, premiseOut{}, err
	}
	return nil, oneOut(item), nil
}

func toolAdd(_ context.Context, _ *mcp.CallToolRequest, in addArgs) (*mcp.CallToolResult, premiseOut, error) {
	store, err := premise.Open(brainRoot())
	if err != nil {
		return nil, premiseOut{}, err
	}
	added, err := store.Add(premise.Premise{
		ID:       in.ID,
		Text:     in.Text,
		Strength: premise.Strength(in.Strength),
		Repos:    in.Repos,
		Status:   premise.Status(in.Status),
		Source:   in.Source,
	})
	if err != nil {
		return nil, premiseOut{}, err
	}
	return nil, oneOut(added), nil
}

func toolUpdate(_ context.Context, _ *mcp.CallToolRequest, in updateArgs) (*mcp.CallToolResult, premiseOut, error) {
	store, err := premise.Open(brainRoot())
	if err != nil {
		return nil, premiseOut{}, err
	}
	updated, err := store.Update(in.ID, premise.Premise{
		Text:     in.Text,
		Strength: premise.Strength(in.Strength),
		Repos:    in.Repos,
		Status:   premise.Status(in.Status),
		Source:   in.Source,
	})
	if err != nil {
		return nil, premiseOut{}, err
	}
	return nil, oneOut(updated), nil
}

func toolDelete(_ context.Context, _ *mcp.CallToolRequest, in idArgs) (*mcp.CallToolResult, premiseOut, error) {
	store, err := premise.Open(brainRoot())
	if err != nil {
		return nil, premiseOut{}, err
	}
	item, err := store.Get(in.ID)
	if err != nil {
		return nil, premiseOut{}, err
	}
	if err := store.Delete(in.ID); err != nil {
		return nil, premiseOut{}, err
	}
	item.Status = premise.StatusDropped
	return nil, oneOut(item), nil
}

func toolSearch(_ context.Context, _ *mcp.CallToolRequest, in searchArgs) (*mcp.CallToolResult, []premiseOut, error) {
	store, err := premise.Open(brainRoot())
	if err != nil {
		return nil, nil, err
	}
	items, err := store.Search(in.Query)
	if err != nil {
		return nil, nil, err
	}
	return nil, premisesOut(items), nil
}

func premisesOut(items []premise.Premise) []premiseOut {
	out := make([]premiseOut, 0, len(items))
	for _, item := range items {
		out = append(out, oneOut(item))
	}
	return out
}

func oneOut(item premise.Premise) premiseOut {
	repos := item.Repos
	if repos == nil {
		repos = []string{}
	}
	return premiseOut{
		ID:       item.ID,
		Text:     item.Text,
		Strength: string(item.Strength),
		Repos:    repos,
		Status:   string(item.Status),
		Source:   item.Source,
	}
}
