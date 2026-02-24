import Foundation
import SwiftUI

enum Theme: String, Codable, CaseIterable {
    case light, dark, system

    var resolved: ColorScheme? {
        switch self {
        case .light: return .light
        case .dark: return .dark
        case .system: return nil
        }
    }
}

enum FontSize: String, Codable, CaseIterable {
    case small, `default`, large, xl

    var cgFloat: CGFloat {
        switch self {
        case .small: return 16
        case .default: return 18
        case .large: return 20
        case .xl: return 22
        }
    }

    var displayName: String {
        switch self {
        case .small: return "Small"
        case .default: return "Default"
        case .large: return "Large"
        case .xl: return "Extra Large"
        }
    }
}

enum LineSpacing: String, Codable, CaseIterable {
    case compact, `default`, relaxed

    var multiplier: CGFloat {
        switch self {
        case .compact: return 1.5
        case .default: return 1.72
        case .relaxed: return 1.9
        }
    }

    var displayName: String {
        switch self {
        case .compact: return "Compact"
        case .default: return "Default"
        case .relaxed: return "Relaxed"
        }
    }
}

enum ReaderWidth: String, Codable, CaseIterable {
    case narrow, `default`, wide

    var points: CGFloat {
        switch self {
        case .narrow: return 520
        case .default: return 620
        case .wide: return 720
        }
    }

    var displayName: String {
        switch self {
        case .narrow: return "Narrow"
        case .default: return "Default"
        case .wide: return "Wide"
        }
    }
}

enum HighlightColor: String, Codable, CaseIterable, Identifiable {
    case yellow, green, blue, pink, orange

    var id: String { rawValue }

    var nsColor: NSColor {
        switch self {
        case .yellow: return NSColor(red: 0.96, green: 0.93, blue: 0.82, alpha: 1.0)
        case .green: return NSColor(red: 0.86, green: 0.91, blue: 0.84, alpha: 1.0)
        case .blue: return NSColor(red: 0.85, green: 0.89, blue: 0.92, alpha: 1.0)
        case .pink: return NSColor(red: 0.93, green: 0.87, blue: 0.89, alpha: 1.0)
        case .orange: return NSColor(red: 0.94, green: 0.89, blue: 0.81, alpha: 1.0)
        }
    }

    var swiftUIColor: Color {
        Color(nsColor: nsColor)
    }

    var displayName: String { rawValue.capitalized }
}

class AppSettings: ObservableObject {
    @AppStorage("theme") var theme: Theme = .system
    @AppStorage("autosave") var autosave: Bool = false
    @AppStorage("persistCorrections") var persistCorrections: Bool = false
    @AppStorage("fontSize") var fontSize: FontSize = .default
    @AppStorage("lineSpacing") var lineSpacing: LineSpacing = .default
    @AppStorage("readerWidth") var readerWidth: ReaderWidth = .default
    @AppStorage("defaultHighlightColor") var defaultHighlightColor: HighlightColor = .yellow
}
