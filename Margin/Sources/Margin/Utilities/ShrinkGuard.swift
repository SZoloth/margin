import Foundation

/// Check whether a content update looks like an accidental mass deletion.
/// Returns (suspicious: true, removedPercent) if the incoming content is
/// suspiciously smaller than the existing content.
func shouldRejectSuspiciousShrink(
    existing: String,
    incoming: String
) -> (suspicious: Bool, removedPercent: Int) {
    let existingBytes = existing.utf8.count
    let incomingBytes = incoming.utf8.count

    // Small files — always allow
    guard existingBytes >= 1024 else {
        return (suspicious: false, removedPercent: 0)
    }

    // No shrink — allow
    guard incomingBytes < existingBytes else {
        return (suspicious: false, removedPercent: 0)
    }

    // Tiny delta — allow
    let delta = existingBytes - incomingBytes
    guard delta >= 256 else {
        return (suspicious: false, removedPercent: 0)
    }

    // Check if incoming is less than 85% of existing
    let threshold = Double(existingBytes) * 0.85
    if Double(incomingBytes) < threshold {
        let removedPercent = Int(Double(delta) / Double(existingBytes) * 100)
        return (suspicious: true, removedPercent: removedPercent)
    }

    return (suspicious: false, removedPercent: 0)
}
