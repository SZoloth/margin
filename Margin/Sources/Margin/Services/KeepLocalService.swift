import Foundation

/// Integration with the keep-local API running on localhost:8787.
final class KeepLocalService: ObservableObject {
    private let baseURL = "http://127.0.0.1:8787"
    private let session: URLSession

    @Published var items: [KeepLocalItem] = []
    @Published var isOnline = false
    @Published var isLoading = false
    @Published var query = ""

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        self.session = URLSession(configuration: config)
    }

    // MARK: - Health Check

    func checkHealth() async {
        do {
            let url = URL(string: "\(baseURL)/api/health")!
            let (data, response) = try await session.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                await MainActor.run { isOnline = false }
                return
            }
            let health = try JSONDecoder().decode(KeepLocalHealth.self, from: data)
            await MainActor.run { isOnline = health.ok }
        } catch {
            await MainActor.run { isOnline = false }
        }
    }

    // MARK: - List Items

    func listItems(limit: Int = 50, offset: Int = 0, query: String? = nil, status: String? = nil) async throws -> [KeepLocalItem] {
        var components = URLComponents(string: "\(baseURL)/api/items")!
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
        if let q = query, !q.isEmpty {
            queryItems.append(URLQueryItem(name: "q", value: q))
        }
        if let s = status, !s.isEmpty {
            queryItems.append(URLQueryItem(name: "status", value: s))
        }
        components.queryItems = queryItems

        let (data, _) = try await session.data(from: components.url!)
        let response = try JSONDecoder().decode(ItemsResponse.self, from: data)
        return response.items
    }

    func loadItems(query: String? = nil) async {
        await MainActor.run { isLoading = true }
        do {
            let fetched = try await listItems(query: query)
            await MainActor.run {
                items = fetched
                isLoading = false
            }
        } catch {
            await MainActor.run { isLoading = false }
        }
    }

    // MARK: - Get Content

    func getContent(itemId: String) async throws -> String {
        let url = URL(string: "\(baseURL)/api/items/\(itemId)/content")!
        let (data, response) = try await session.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw KeepLocalError.contentNotAvailable
        }
        guard let content = String(data: data, encoding: .utf8), !content.isEmpty else {
            throw KeepLocalError.contentNotAvailable
        }
        return content
    }

    func search(_ query: String) {
        self.query = query
        Task { await loadItems(query: query.isEmpty ? nil : query) }
    }
}

// MARK: - Models

struct KeepLocalHealth: Codable {
    let ok: Bool
    let now: Int64
}

struct KeepLocalItem: Identifiable, Codable {
    let id: String
    let url: String
    let title: String?
    let author: String?
    let domain: String?
    let platform: String?
    let wordCount: Int64
    let tags: [String]
    let createdAt: Int64
    let status: String
    let contentAvailable: Bool

    enum CodingKeys: String, CodingKey {
        case id, url, title, author, domain, platform
        case wordCount = "word_count"
        case tags
        case createdAt = "created_at"
        case status
        case contentAvailable = "content_available"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        url = try container.decode(String.self, forKey: .url)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        author = try container.decodeIfPresent(String.self, forKey: .author)
        domain = try container.decodeIfPresent(String.self, forKey: .domain)
        platform = try container.decodeIfPresent(String.self, forKey: .platform)
        wordCount = try container.decodeIfPresent(Int64.self, forKey: .wordCount) ?? 0
        tags = try container.decodeIfPresent([String].self, forKey: .tags) ?? []
        createdAt = try container.decode(Int64.self, forKey: .createdAt)
        status = try container.decode(String.self, forKey: .status)
        contentAvailable = try container.decodeIfPresent(Bool.self, forKey: .contentAvailable) ?? false
    }
}

private struct ItemsResponse: Codable {
    let items: [KeepLocalItem]
    let count: Int64
}

enum KeepLocalError: LocalizedError {
    case contentNotAvailable

    var errorDescription: String? {
        switch self {
        case .contentNotAvailable: return "Content not available"
        }
    }
}
