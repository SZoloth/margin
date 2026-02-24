// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Margin",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "6.24.0"),
    ],
    targets: [
        // Library target containing all app logic (testable)
        .target(
            name: "MarginCore",
            dependencies: [
                .product(name: "GRDB", package: "GRDB.swift"),
            ],
            path: "Sources/Margin",
            exclude: ["MarginApp.swift"],
            resources: [
                .process("Resources"),
            ]
        ),
        // Thin executable entry point
        .executableTarget(
            name: "Margin",
            dependencies: ["MarginCore"],
            path: "Sources/MarginApp"
        ),
        // Tests
        .testTarget(
            name: "MarginTests",
            dependencies: [
                "MarginCore",
                .product(name: "GRDB", package: "GRDB.swift"),
            ],
            path: "Tests/MarginTests"
        ),
    ]
)
