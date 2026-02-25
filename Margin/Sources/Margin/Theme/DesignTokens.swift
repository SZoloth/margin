import SwiftUI

// MARK: - Design Tokens
// Centralized values for spacing, typography, elevation, corner radii, and animation timing.

enum Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
}

enum Typography {
    static let caption = Font.system(size: 11)
    static let captionMedium = Font.system(size: 12, weight: .medium)
    static let body = Font.system(size: 13)
    static let headingSemibold = Font.system(size: 13, weight: .semibold)
}

struct Shadow {
    let color: Color
    let radius: CGFloat
    let y: CGFloat
}

enum Elevation {
    static let popover = Shadow(color: .black.opacity(0.15), radius: 16, y: 6)
    static let toast = Shadow(color: .black.opacity(0.1), radius: 8, y: 2)
}

enum CornerRadius {
    static let sm: CGFloat = 6
    static let md: CGFloat = 10
    static let lg: CGFloat = 14
}

enum AnimationDuration {
    static let fast: Double = 0.12
    static let normal: Double = 0.15
    static let slow: Double = 0.2
}

// MARK: - View Extensions

extension View {
    func elevationShadow(_ shadow: Shadow) -> some View {
        self.shadow(color: shadow.color, radius: shadow.radius, y: shadow.y)
    }
}
