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
	Long: `Regenerate the unified writing profile and agent-specific artifacts.

Default (no --target flag): writes ~/.margin/writing-rules.md and
~/.claude/hooks/writing_guard.py. Also updates ~/.codex/AGENTS.md if
~/.codex exists (Codex CLI is installed).

--target codex: writes ~/.margin/writing-rules.md and ~/.codex/AGENTS.md.
Skips writing_guard.py — Codex uses prompt-level rules instead of a hook.`,
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		target, _ := cmd.Flags().GetString("target")
		if err := profile.ExportProfile(dbPath, target); err != nil {
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

var exportCoachingCmd = &cobra.Command{
	Use:   "coaching-prompt",
	Short: "Generate Architecture G coaching prompt for writing",
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		writingType, _ := cmd.Flags().GetString("type")
		register, _ := cmd.Flags().GetString("register")

		if writingType == "" {
			output.Error("--type flag is required")
		}

		result, err := profile.GenerateCoachingPrompt(dbPath, writingType, register)
		if err != nil {
			output.ErrorE(err)
		}
		fmt.Print(result)
	},
}

var exportSynthesisCmd = &cobra.Command{
	Use:   "synthesis-prompt",
	Short: "Generate the prompt to synthesize queued corrections into candidate rules",
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		writingType, _ := cmd.Flags().GetString("type")
		limit, _ := cmd.Flags().GetInt("limit")

		statsOnly, _ := cmd.Flags().GetBool("stats")
		if statsOnly {
			stats, err := profile.SynthesisStats(dbPath)
			if err != nil {
				output.ErrorE(err)
			}
			pretty, _ := cmd.Flags().GetBool("pretty")
			output.JSON(stats, pretty)
			return
		}

		result, err := profile.GenerateSynthesisPrompt(dbPath, writingType, limit)
		if err != nil {
			output.ErrorE(err)
		}
		fmt.Print(result)
	},
}

func init() {
	exportWaitCmd.Flags().Int("timeout", 300, "timeout in seconds (max 600)")
	exportProfileCmd.Flags().String("target", "", "agent target: omit for Claude Code (default), or 'codex'")

	exportCoachingCmd.Flags().String("type", "", "writing type (email, blog, cover-letter, etc.)")
	exportCoachingCmd.Flags().String("register", "", "register override (casual, professional, etc.)")

	exportSynthesisCmd.Flags().String("type", "", "writing type to scope synthesis to (default: all)")
	exportSynthesisCmd.Flags().Int("limit", 0, "max corrections to include (default: 500)")
	exportSynthesisCmd.Flags().Bool("stats", false, "print queue counts by writing type instead of the prompt")
	exportSynthesisCmd.Flags().Bool("pretty", false, "pretty-print JSON (with --stats)")

	exportCmd.AddCommand(exportWaitCmd, exportProfileCmd, exportCodexCmd, exportCoachingCmd, exportSynthesisCmd)
	rootCmd.AddCommand(exportCmd)
}
