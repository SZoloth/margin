import Foundation
import SwiftUI

public enum Theme: String, Codable, CaseIterable {
    case light, dark, system

    public var resolved: ColorScheme? {
        switch self {
        case .light: return .light
        case .dark: return .dark
        case .system: return nil
        }
    }
}

public enum FontSize: String, Codable, CaseIterable {
    case small, `default`, large, xl

    public var cgFloat: CGFloat {
        switch self {
        case .small: return 16
        case .default: return 18
        case .large: return 20
        case .xl: return 22
        }
    }

    public var displayName: String {
        switch self {
        case .small: return "Small"
        case .default: return "Default"
        case .large: return "Large"
        case .xl: return "Extra Large"
        }
    }
}

public enum LineSpacing: String, Codable, CaseIterable {
    case compact, `default`, relaxed

    public var multiplier: CGFloat {
        switch self {
        case .compact: return 1.5
        case .default: return 1.72
        case .relaxed: return 1.9
        }
    }

    public var displayName: String {
        switch self {
        case .compact: return "Compact"
        case .default: return "Default"
        case .relaxed: return "Relaxed"
        }
    }
}

public enum ReaderWidth: String, Codable, CaseIterable {
    case narrow, `default`, wide

    public var points: CGFloat {
        switch self {
        case .narrow: return 520
        case .default: return 620
        case .wide: return 720
        }
    }

    public var displayName: String {
        switch self {
        case .narrow: return "Narrow"
        case .default: return "Default"
        case .wide: return "Wide"
        }
    }
}

public enum HighlightColor: String, Codable, CaseIterable, Identifiable {
    case yellow, green, blue, pink, orange

    public var id: String { rawValue }

    public var nsColor: NSColor {
        switch self {
        case .yellow:
            return NSColor(name: nil) { appearance in
                appearance.bestMatch(from: [.darkAqua, .vibrantDark]) != nil
                    ? NSColor(red: 0.55, green: 0.50, blue: 0.20, alpha: 1.0)
                    : NSColor(red: 0.96, green: 0.93, blue: 0.82, alpha: 1.0)
            }
        case .green:
            return NSColor(name: nil) { appearance in
                appearance.bestMatch(from: [.darkAqua, .vibrantDark]) != nil
                    ? NSColor(red: 0.22, green: 0.45, blue: 0.25, alpha: 1.0)
                    : NSColor(red: 0.86, green: 0.91, blue: 0.84, alpha: 1.0)
            }
        case .blue:
            return NSColor(name: nil) { appearance in
                appearance.bestMatch(from: [.darkAqua, .vibrantDark]) != nil
                    ? NSColor(red: 0.20, green: 0.38, blue: 0.55, alpha: 1.0)
                    : NSColor(red: 0.85, green: 0.89, blue: 0.92, alpha: 1.0)
            }
        case .pink:
            return NSColor(name: nil) { appearance in
                appearance.bestMatch(from: [.darkAqua, .vibrantDark]) != nil
                    ? NSColor(red: 0.55, green: 0.22, blue: 0.35, alpha: 1.0)
                    : NSColor(red: 0.93, green: 0.87, blue: 0.89, alpha: 1.0)
            }
        case .orange:
            return NSColor(name: nil) { appearance in
                appearance.bestMatch(from: [.darkAqua, .vibrantDark]) != nil
                    ? NSColor(red: 0.55, green: 0.38, blue: 0.15, alpha: 1.0)
                    : NSColor(red: 0.94, green: 0.89, blue: 0.81, alpha: 1.0)
            }
        }
    }

    public var swiftUIColor: Color {
        Color(nsColor: nsColor)
    }

    public var displayName: String { rawValue.capitalized }
}

public class AppSettings: ObservableObject {
    @AppStorage("theme") public var theme: Theme = .system
    @AppStorage("autosave") public var autosave: Bool = false
    @AppStorage("persistCorrections") public var persistCorrections: Bool = false
    @AppStorage("fontSize") public var fontSize: FontSize = .default
    @AppStorage("lineSpacing") public var lineSpacing: LineSpacing = .default
    @AppStorage("readerWidth") public var readerWidth: ReaderWidth = .default
    @AppStorage("defaultHighlightColor") public var defaultHighlightColor: HighlightColor = .yellow

    public init() {}
}
