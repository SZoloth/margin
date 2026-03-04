package cmd

import (
	"github.com/nicholasgasior/margin/cli/output"
	"github.com/nicholasgasior/margin/cli/skill"
	"github.com/spf13/cobra"
)

var skillInstallCmd = &cobra.Command{
	Use:   "skill-install",
	Short: "Install the Margin CLI skill file for Claude Code",
	Run: func(cmd *cobra.Command, args []string) {
		force, _ := cmd.Flags().GetBool("force")
		if err := skill.Install(force); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]string{"status": "installed", "path": "~/.claude/skills/margin-cli/SKILL.md"}, pretty)
	},
}

func init() {
	skillInstallCmd.Flags().Bool("force", false, "overwrite existing skill file")
	rootCmd.AddCommand(skillInstallCmd)
}
