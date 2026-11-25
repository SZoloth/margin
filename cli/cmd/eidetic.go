package cmd

import (
	"fmt"

	"github.com/SZoloth/margin/cli/eidetic"
	"github.com/SZoloth/margin/cli/output"
	"github.com/spf13/cobra"
)

var (
	eideticWorkspace string
	eideticEEBin     string
)

var eideticCmd = &cobra.Command{
	Use:   "eidetic",
	Short: "Epistemic memory compiler powered by Eidetic Engine (`ee`)",
	Long:  "Optional sidecar integration with Eidetic Engine (ee): sync Margin rules/highlights/corrections, compile BLAKE3-hashed Thinking Packs, record Bayesian outcomes, and export forkable Judgment Packs.",
}

var eideticSyncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Sync Margin rules, highlights, and corrections into an ee workspace",
	Run: func(cmd *cobra.Command, args []string) {
		maxRules, _ := cmd.Flags().GetInt("max-rules")
		maxHighlights, _ := cmd.Flags().GetInt("max-highlights")
		maxCorrections, _ := cmd.Flags().GetInt("max-corrections")
		batchSize, _ := cmd.Flags().GetInt("batch-size")

		res, err := eidetic.Sync(eidetic.SyncOptions{
			DBPath:         resolveDBPath(),
			Workspace:      eideticWorkspace,
			MaxRules:       maxRules,
			MaxHighlights:  maxHighlights,
			MaxCorrections: maxCorrections,
			BatchSize:      batchSize,
			EEBin:          eideticEEBin,
		})
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(res, pretty)
	},
}

var eideticPackCmd = &cobra.Command{
	Use:   "pack <query>",
	Short: "Compile a deterministic, budget-capped Thinking Pack for a topic",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		maxTokens, _ := cmd.Flags().GetInt("max-tokens")
		rawText, _ := cmd.Flags().GetBool("raw")

		res, err := eidetic.Pack(eideticEEBin, eideticWorkspace, args[0], maxTokens)
		if err != nil {
			output.ErrorE(err)
		}
		if rawText {
			fmt.Println(res.Text)
			return
		}
		output.JSON(res, pretty)
	},
}

var eideticOutcomeCmd = &cobra.Command{
	Use:   "outcome <memory-id> <helpful|harmful>",
	Short: "Record Bayesian outcome feedback (helpful +1, harmful +2.5x) on a synced memory",
	Args:  cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		sourceID, _ := cmd.Flags().GetString("source")
		reason, _ := cmd.Flags().GetString("reason")

		raw, err := eidetic.RecordOutcome(eideticEEBin, eideticWorkspace, args[0], args[1], sourceID, reason)
		if err != nil {
			output.ErrorE(err)
		}
		fmt.Println(string(raw))
	},
}

var eideticExportPackCmd = &cobra.Command{
	Use:   "export-pack",
	Short: "Export a redacted, subscriber-ready Judgment Pack (agent_validated trust)",
	Run: func(cmd *cobra.Command, args []string) {
		outDir, _ := cmd.Flags().GetString("output-dir")
		label, _ := cmd.Flags().GetString("label")
		if outDir == "" {
			output.Error("--output-dir is required")
		}
		res, err := eidetic.ExportJudgmentPack(eideticEEBin, eideticWorkspace, outDir, label)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(res, pretty)
	},
}

func init() {
	eideticCmd.PersistentFlags().StringVar(&eideticWorkspace, "workspace", "", "ee workspace path (default ~/.margin/eidetic)")
	eideticCmd.PersistentFlags().StringVar(&eideticEEBin, "ee-bin", "", "optional path to ee binary")

	eideticSyncCmd.Flags().Int("max-rules", 200, "maximum active writing rules to sync")
	eideticSyncCmd.Flags().Int("max-highlights", 100, "maximum highlights to sync")
	eideticSyncCmd.Flags().Int("max-corrections", 100, "maximum recent corrections to sync")
	eideticSyncCmd.Flags().Int("batch-size", eidetic.DefaultBatchSize, "records per ee remember --batch call (max 25)")

	eideticPackCmd.Flags().Int("max-tokens", 2000, "token budget for the compiled Thinking Pack")
	eideticPackCmd.Flags().Bool("raw", false, "print rendered markdown text instead of JSON")

	eideticOutcomeCmd.Flags().String("source", "margin-user", "outcome source identifier")
	eideticOutcomeCmd.Flags().String("reason", "", "short explanation for the outcome")

	eideticExportPackCmd.Flags().String("output-dir", "", "directory where the Judgment Pack archive is written")
	eideticExportPackCmd.Flags().String("label", "Margin Writing Judgment Pack", "human label recorded in the export manifest")

	eideticCmd.AddCommand(eideticSyncCmd, eideticPackCmd, eideticOutcomeCmd, eideticExportPackCmd)
	rootCmd.AddCommand(eideticCmd)
}
