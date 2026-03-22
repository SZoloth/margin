package cmd

import (
	"github.com/nicholasgasior/margin/cli/output"
	"github.com/nicholasgasior/margin/cli/skill"
	"github.com/spf13/cobra"
)

var skillInstallCmd = &cobra.Command{
	Use:   "skill-install",
	Short: "Install the Margin CLI skill file for an AI coding agent",
	Run: func(cmd *cobra.Command, args []string) {
		force, _ := cmd.Flags().GetBool("force")
		target, _ := cmd.Flags().GetString("target")
		path, err := skill.Install(force, target)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]string{"status": "installed", "path": path}, pretty)
	},
}

func init() {
	skillInstallCmd.Flags().Bool("force", false, "overwrite existing skill file")
	skillInstallCmd.Flags().String("target", "claude", "agent target: claude (default) or codex")
	rootCmd.AddCommand(skillInstallCmd)
}
