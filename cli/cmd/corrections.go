package cmd

import (
	"github.com/nicholasgasior/margin/cli/db"
	"github.com/nicholasgasior/margin/cli/output"
	"github.com/nicholasgasior/margin/cli/profile"
	"github.com/spf13/cobra"
)

var correctionsCmd = &cobra.Command{
	Use:   "corrections",
	Short: "Correction operations",
}

var correctionsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List corrections",
	Run: func(cmd *cobra.Command, args []string) {
		docID, _ := cmd.Flags().GetString("doc")
		limit, _ := cmd.Flags().GetInt("limit")

		d, err := db.OpenRead(resolveDBPath())
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		var docPtr *string
		if docID != "" {
			docPtr = &docID
		}
		records, err := db.GetCorrections(d, docPtr, limit)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(records, pretty)
	},
}

var correctionsSummaryCmd = &cobra.Command{
	Use:   "summary",
	Short: "Corrections summary",
	Run: func(cmd *cobra.Command, args []string) {
		d, err := db.OpenRead(resolveDBPath())
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		summary, err := db.GetCorrectionsSummary(d)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(summary, pretty)
	},
}

var correctionsCreateCmd = &cobra.Command{
	Use:   "create <doc_id>",
	Short: "Create a correction",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		text, _ := cmd.Flags().GetString("text")
		notes, _ := cmd.Flags().GetStringArray("notes")
		wType, _ := cmd.Flags().GetString("type")
		color, _ := cmd.Flags().GetString("color")

		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		var wtPtr *string
		if wType != "" {
			wtPtr = &wType
		}

		result, err := db.CreateCorrection(d, args[0], text, notes, wtPtr, color)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(result, pretty)
		profile.ExportProfile(dbPath)
	},
}

var correctionsDeleteCmd = &cobra.Command{
	Use:   "delete <highlight_id>",
	Short: "Delete a correction",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		if err := db.DeleteCorrection(d, args[0]); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]bool{"success": true}, pretty)
		profile.ExportProfile(dbPath)
	},
}

var correctionsSetTypeCmd = &cobra.Command{
	Use:   "set-type <highlight_id>",
	Short: "Set correction writing type",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		wType, _ := cmd.Flags().GetString("type")
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		if err := db.UpdateCorrectionWritingType(d, args[0], wType); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]bool{"success": true}, pretty)
		profile.ExportProfile(dbPath)
	},
}

var correctionsSetPolarityCmd = &cobra.Command{
	Use:   "set-polarity <highlight_id>",
	Short: "Set correction polarity",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		polarity, _ := cmd.Flags().GetString("polarity")
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		if err := db.SetCorrectionPolarity(d, args[0], polarity); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]bool{"success": true}, pretty)
		profile.ExportProfile(dbPath)
	},
}

var correctionsVoiceSignalsCmd = &cobra.Command{
	Use:   "voice-signals",
	Short: "Get voice signals",
	Run: func(cmd *cobra.Command, args []string) {
		polarity, _ := cmd.Flags().GetString("polarity")
		limit, _ := cmd.Flags().GetInt("limit")

		d, err := db.OpenRead(resolveDBPath())
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		var polPtr *string
		if polarity != "" {
			polPtr = &polarity
		}
		records, err := db.GetVoiceSignals(d, polPtr, limit)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(records, pretty)
	},
}

func init() {
	correctionsListCmd.Flags().String("doc", "", "filter by document ID")
	correctionsListCmd.Flags().Int("limit", 200, "max results")

	correctionsCreateCmd.Flags().String("text", "", "original text to highlight")
	correctionsCreateCmd.Flags().StringArray("notes", nil, "correction notes (repeatable)")
	correctionsCreateCmd.Flags().String("type", "", "writing type")
	correctionsCreateCmd.Flags().String("color", "yellow", "highlight color")
	correctionsCreateCmd.MarkFlagRequired("text")
	correctionsCreateCmd.MarkFlagRequired("notes")

	correctionsSetTypeCmd.Flags().String("type", "", "writing type")
	correctionsSetTypeCmd.MarkFlagRequired("type")

	correctionsSetPolarityCmd.Flags().String("polarity", "", "polarity (positive/corrective)")
	correctionsSetPolarityCmd.MarkFlagRequired("polarity")

	correctionsVoiceSignalsCmd.Flags().String("polarity", "", "filter by polarity")
	correctionsVoiceSignalsCmd.Flags().Int("limit", 500, "max results")

	correctionsCmd.AddCommand(
		correctionsListCmd, correctionsSummaryCmd, correctionsCreateCmd,
		correctionsDeleteCmd, correctionsSetTypeCmd, correctionsSetPolarityCmd,
		correctionsVoiceSignalsCmd,
	)
	rootCmd.AddCommand(correctionsCmd)
}
