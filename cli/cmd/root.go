package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var (
	dbPath string
	pretty bool

	Version = "dev"
)

var rootCmd = &cobra.Command{
	Use:   "margin",
	Short: "Margin CLI — reading & annotation toolkit",
	Long:  "CLI for the Margin reading and annotation app. Reads and writes to the Margin SQLite database.",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, `{"error":%q}`+"\n", err.Error())
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVar(&dbPath, "db", "", "path to margin.db (default ~/.margin/margin.db)")
	rootCmd.PersistentFlags().BoolVar(&pretty, "pretty", false, "pretty-print JSON output")

	rootCmd.AddCommand(versionCmd)
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print version",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println(Version)
	},
}

func resolveDBPath() string {
	if dbPath != "" {
		return dbPath
	}
	if env := os.Getenv("MARGIN_DB"); env != "" {
		return env
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".margin", "margin.db")
}
