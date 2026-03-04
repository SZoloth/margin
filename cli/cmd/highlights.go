package cmd

import (
	"github.com/nicholasgasior/margin/cli/db"
	"github.com/nicholasgasior/margin/cli/output"
	"github.com/nicholasgasior/margin/cli/profile"
	"github.com/spf13/cobra"
)

var highlightsCmd = &cobra.Command{
	Use:   "highlights",
	Short: "Highlight operations",
}

var highlightsCreateCmd = &cobra.Command{
	Use:   "create <doc_id>",
	Short: "Create a highlight",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		text, _ := cmd.Flags().GetString("text")
		color, _ := cmd.Flags().GetString("color")
		fromPos, _ := cmd.Flags().GetInt("from")
		toPos, _ := cmd.Flags().GetInt("to")
		note, _ := cmd.Flags().GetString("note")

		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		if cmd.Flags().Changed("from") && cmd.Flags().Changed("to") {
			// Positional highlight
			var prefixCtx, suffixCtx *string
			h, err := db.CreateHighlight(d, args[0], color, text, fromPos, toPos, prefixCtx, suffixCtx)
			if err != nil {
				output.ErrorE(err)
			}
			if note != "" {
				n, err := db.CreateMarginNote(d, h.ID, note)
				if err != nil {
					output.ErrorE(err)
				}
				output.JSON(db.HighlightByTextResult{Highlight: *h, Note: n}, pretty)
			} else {
				output.JSON(h, pretty)
			}
		} else {
			// Text-search highlight
			var notePtr *string
			if note != "" {
				notePtr = &note
			}
			result, err := db.HighlightByText(d, args[0], text, color, notePtr)
			if err != nil {
				output.ErrorE(err)
			}
			output.JSON(result, pretty)
		}

		profile.ExportProfile(dbPath)
	},
}

var highlightsDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "Delete a highlight",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		if err := db.DeleteHighlight(d, args[0]); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]bool{"success": true}, pretty)
		profile.ExportProfile(dbPath)
	},
}

var highlightsColorCmd = &cobra.Command{
	Use:   "color <id>",
	Short: "Update highlight color",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		color, _ := cmd.Flags().GetString("color")
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		if err := db.UpdateHighlightColor(d, args[0], color); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]bool{"success": true}, pretty)
		profile.ExportProfile(dbPath)
	},
}

func init() {
	highlightsCreateCmd.Flags().String("text", "", "text content to highlight")
	highlightsCreateCmd.Flags().String("color", "yellow", "highlight color")
	highlightsCreateCmd.Flags().Int("from", 0, "start position (positional mode)")
	highlightsCreateCmd.Flags().Int("to", 0, "end position (positional mode)")
	highlightsCreateCmd.Flags().String("note", "", "optional margin note")
	highlightsCreateCmd.MarkFlagRequired("text")
	highlightsCreateCmd.MarkFlagRequired("color")

	highlightsColorCmd.Flags().String("color", "", "new color")
	highlightsColorCmd.MarkFlagRequired("color")

	highlightsCmd.AddCommand(highlightsCreateCmd, highlightsDeleteCmd, highlightsColorCmd)
	rootCmd.AddCommand(highlightsCmd)
}
