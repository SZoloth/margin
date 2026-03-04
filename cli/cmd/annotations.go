package cmd

import (
	"github.com/nicholasgasior/margin/cli/db"
	"github.com/nicholasgasior/margin/cli/output"
	"github.com/spf13/cobra"
)

var annotationsCmd = &cobra.Command{
	Use:   "annotations",
	Short: "Annotation operations",
}

var annotationsListCmd = &cobra.Command{
	Use:   "list <doc_id>",
	Short: "List annotations for a document",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		d, err := db.OpenRead(resolveDBPath())
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		entries, err := db.GetAnnotations(d, args[0])
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(entries, pretty)
	},
}

func init() {
	annotationsCmd.AddCommand(annotationsListCmd)
	rootCmd.AddCommand(annotationsCmd)
}
