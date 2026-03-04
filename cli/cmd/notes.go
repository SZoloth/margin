package cmd

import (
	"github.com/nicholasgasior/margin/cli/db"
	"github.com/nicholasgasior/margin/cli/output"
	"github.com/nicholasgasior/margin/cli/profile"
	"github.com/spf13/cobra"
)

var notesCmd = &cobra.Command{
	Use:   "notes",
	Short: "Margin note operations",
}

var notesCreateCmd = &cobra.Command{
	Use:   "create <highlight_id>",
	Short: "Create a margin note",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		content, _ := cmd.Flags().GetString("content")
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		note, err := db.CreateMarginNote(d, args[0], content)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(note, pretty)
		profile.ExportProfile(dbPath)
	},
}

var notesUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "Update a margin note",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		content, _ := cmd.Flags().GetString("content")
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		note, err := db.UpdateMarginNote(d, args[0], content)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(note, pretty)
		profile.ExportProfile(dbPath)
	},
}

var notesDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "Delete a margin note",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		if err := db.DeleteMarginNote(d, args[0]); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]bool{"success": true}, pretty)
		profile.ExportProfile(dbPath)
	},
}

func init() {
	notesCreateCmd.Flags().String("content", "", "note content")
	notesCreateCmd.MarkFlagRequired("content")

	notesUpdateCmd.Flags().String("content", "", "new content")
	notesUpdateCmd.MarkFlagRequired("content")

	notesCmd.AddCommand(notesCreateCmd, notesUpdateCmd, notesDeleteCmd)
	rootCmd.AddCommand(notesCmd)
}
