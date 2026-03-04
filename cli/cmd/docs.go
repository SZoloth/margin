package cmd

import (
	"fmt"

	"github.com/nicholasgasior/margin/cli/db"
	"github.com/nicholasgasior/margin/cli/output"
	"github.com/spf13/cobra"
)

var docsCmd = &cobra.Command{
	Use:   "docs",
	Short: "Document operations",
}

var docsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List documents",
	Run: func(cmd *cobra.Command, args []string) {
		limit, _ := cmd.Flags().GetInt("limit")
		d, err := db.OpenRead(resolveDBPath())
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		docs, err := db.ListDocuments(d, limit)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(docs, pretty)
	},
}

var docsGetCmd = &cobra.Command{
	Use:   "get <id>",
	Short: "Get document metadata",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		d, err := db.OpenRead(resolveDBPath())
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		doc, err := db.GetDocument(d, args[0])
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(doc, pretty)
	},
}

var docsReadCmd = &cobra.Command{
	Use:   "read <id>",
	Short: "Read document content",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		d, err := db.OpenRead(resolveDBPath())
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		content, err := db.ReadDocument(d, args[0])
		if err != nil {
			output.ErrorE(err)
		}
		fmt.Print(content)
	},
}

var docsSearchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Full-text search documents",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		limit, _ := cmd.Flags().GetInt("limit")
		d, err := db.OpenRead(resolveDBPath())
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		results, err := db.SearchDocuments(d, args[0], limit)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(results, pretty)
	},
}

func init() {
	docsListCmd.Flags().Int("limit", 20, "max documents to return")
	docsSearchCmd.Flags().Int("limit", 20, "max results to return")

	docsCmd.AddCommand(docsListCmd, docsGetCmd, docsReadCmd, docsSearchCmd)
	rootCmd.AddCommand(docsCmd)
}
