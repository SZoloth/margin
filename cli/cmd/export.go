package cmd

import (
	"fmt"

	"github.com/nicholasgasior/margin/cli/bridge"
	"github.com/nicholasgasior/margin/cli/output"
	"github.com/nicholasgasior/margin/cli/profile"
	"github.com/spf13/cobra"
)

var exportCmd = &cobra.Command{
	Use:   "export",
	Short: "Export operations",
}

var exportWaitCmd = &cobra.Command{
	Use:   "wait",
	Short: "Start HTTP bridge and wait for export from Margin app",
	Run: func(cmd *cobra.Command, args []string) {
		timeout, _ := cmd.Flags().GetInt("timeout")
		prompt, err := bridge.WaitForExport(timeout)
		if err != nil {
			output.ErrorE(err)
		}
		fmt.Print(prompt)
	},
}

var exportProfileCmd = &cobra.Command{
	Use:   "profile",
	Short: "Regenerate writing profile and guard hook",
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		if err := profile.ExportProfile(dbPath); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]bool{"success": true}, pretty)
	},
}

var exportCodexCmd = &cobra.Command{
	Use:   "codex",
	Short: "Regenerate ~/.codex/AGENTS.md with writing rules for OpenAI Codex",
	Long: `Writes writing rules from Margin into ~/.codex/AGENTS.md so OpenAI Codex CLI
loads them as global instructions. Safe to run repeatedly — only the managed
section is replaced; any existing user content in AGENTS.md is preserved.

Note: requires ~/.codex directory to exist (i.e. Codex CLI installed).`,
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		if err := profile.ExportCodex(dbPath); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]string{"status": "ok", "path": profile.CodexAgentsMDPath()}, pretty)
	},
}

func init() {
	exportWaitCmd.Flags().Int("timeout", 300, "timeout in seconds (max 600)")

	exportCmd.AddCommand(exportWaitCmd, exportProfileCmd, exportCodexCmd)
	rootCmd.AddCommand(exportCmd)
}
