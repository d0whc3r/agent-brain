# Obsidian

Use `brain-premises` for rules. It works with Obsidian closed and preserves validation, scope, candidates, and archived deletions. Open `premises.base` in Obsidian for a view over the same files.

The general Obsidian MCP is optional for live metadata, the active note, and commands. It runs inside Obsidian, so the app and vault must be open. It does not implement the brain premise contract.

If those live capabilities are needed, install a compatible version of the [Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api). The plugin includes its own Streamable HTTP MCP endpoint at `https://127.0.0.1:27124/mcp/`; a separate third-party bridge is not required for clients that support that transport.

Copy the MCP URL into `mcp/snippets/obsidian.url`.

Store the API key in `mcp/snippets/obsidian.key` with file permissions `0600`. Use it as a bearer credential in the client's private configuration. Do not paste it into a note or a tracked snippet.

Both files are gitignored. Do not commit them.

Do not register the Obsidian MCP until both files exist.

These two files are private setup inputs; the brain installer does not consume them or register this optional server. Configure the client separately and verify an authenticated read. Trust the plugin's local certificate authority in that client; do not disable TLS verification globally.

The agent adds, updates, and deletes premises only through `brain premise` or the premise MCP. A general vault write can bypass validation even though the result appears in Obsidian.
