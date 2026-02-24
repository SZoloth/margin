import SwiftUI

/// Popover shown when exporting annotations.
struct ExportPopoverView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var exportResult: ExportService.ExportResult?
    @State private var isExporting = false

    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Text("Export Annotations")
                    .font(.system(size: 16, weight: .semibold))
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            if let result = exportResult {
                // Success state
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(.green)

                    Text("Copied to clipboard!")
                        .font(.system(size: 14, weight: .medium))

                    Text("\(result.highlightCount) highlights, \(result.noteCount) notes")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)

                    if !result.snippets.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(result.snippets, id: \.self) { snippet in
                                Text("• \(snippet)")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            } else {
                // Pre-export state
                VStack(spacing: 12) {
                    Text("Export \(appState.highlights.count) annotations as markdown to clipboard.")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    Button {
                        isExporting = true
                        let result = appState.exportAnnotations()
                        exportResult = result
                        isExporting = false
                    } label: {
                        Text("Export to Clipboard")
                            .font(.system(size: 13, weight: .medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isExporting)
                }
            }
        }
        .padding(20)
        .frame(width: 320)
    }
}
