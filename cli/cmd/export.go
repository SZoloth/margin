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

func init() {
	exportWaitCmd.Flags().Int("timeout", 300, "timeout in seconds (max 600)")

	exportCmd.AddCommand(exportWaitCmd, exportProfileCmd)
	rootCmd.AddCommand(exportCmd)
}
