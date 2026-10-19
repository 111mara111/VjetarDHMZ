import SwiftUI

struct NauticalLine: Identifiable {
    let id = UUID()
    let text: String
    let isHeading: Bool
}

enum NauticalParser {
    static let headingPrefixes = ["izvješće", "izvjesce", "upozorenj", "stanje",
                                  "vremenska prognoza", "izgledi", "prognoza"]

    static func parse(html: String) -> [NauticalLine] {
        var s = html
        s = s.replacingOccurrences(of: "(?is)<script.*?</script>", with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: "(?is)<style.*?</style>", with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: "(?i)<br\\s*/?>|</p>|</div>|</h[1-6]>|</tr>|</li>",
                                   with: "\n", options: .regularExpression)
        s = s.replacingOccurrences(of: "(?s)<[^>]+>", with: "", options: .regularExpression)
        s = decodeEntities(s)

        // Keep only the actual report: from "Izvješće Službe…" to the Douglas scale.
        guard let start = s.range(of: "Izvješće Službe", options: .caseInsensitive) else { return [] }
        s = String(s[start.lowerBound...])
        if let end = s.range(of: "Douglasova", options: .caseInsensitive) {
            s = String(s[..<end.lowerBound])
        }

        return s.components(separatedBy: .newlines)
            .map { $0.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
                     .trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .map { line in
                let lower = line.lowercased()
                let heading = headingPrefixes.contains { lower.hasPrefix($0) } && line.count < 90
                return NauticalLine(text: line, isHeading: heading)
            }
    }

    private static func decodeEntities(_ input: String) -> String {
        var s = input
        let named: [String: String] = [
            "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&apos;": "'",
            "&scaron;": "š", "&Scaron;": "Š", "&ccaron;": "č", "&Ccaron;": "Č",
            "&cacute;": "ć", "&Cacute;": "Ć", "&dstrok;": "đ", "&Dstrok;": "Đ",
            "&zcaron;": "ž", "&Zcaron;": "Ž"
        ]
        for (k, v) in named { s = s.replacingOccurrences(of: k, with: v) }

        if let regex = try? NSRegularExpression(pattern: "&#(\\d+);") {
            let ns = s as NSString
            var out = ""
            var last = 0
            for m in regex.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
                out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
                if let code = UInt32(ns.substring(with: m.range(at: 1))), let u = Unicode.Scalar(code) {
                    out += String(Character(u))
                }
                last = m.range.location + m.range.length
            }
            out += ns.substring(from: last)
            s = out
        }
        return s
    }
}

@MainActor
final class NauticalStore: ObservableObject {
    enum State { case idle, loading, loaded, failed }

    static let pageURL = URL(string: "https://meteo.hr/prognoze.php?section=prognoze_specp&param=jadran")!

    @Published var lines: [NauticalLine] = []
    @Published var state: State = .idle

    func load() async {
        state = .loading
        do {
            var request = URLRequest(url: Self.pageURL)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 20
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                state = .failed; return
            }
            let html = String(data: data, encoding: .utf8)
                ?? String(data: data, encoding: .windowsCP1250)
                ?? String(decoding: data, as: UTF8.self)
            let parsed = await Task.detached { NauticalParser.parse(html: html) }.value
            lines = parsed
            state = parsed.isEmpty ? .failed : .loaded
        } catch {
            state = .failed
        }
    }
}

struct NauticalView: View {
    @StateObject private var store = NauticalStore()

    var body: some View {
        ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if store.lines.isEmpty && store.state != .failed {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                    } else if store.lines.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "wifi.exclamationmark").font(.largeTitle)
                            Text("Prognoza nije dostupna")
                            Button("Pokušaj ponovno") { Task { await store.load() } }
                                .buttonStyle(.bordered)
                        }
                        .frame(maxWidth: .infinity).padding(.top, 60)
                    } else {
                        ForEach(store.lines) { line in
                            if line.isHeading {
                                Text(line.text)
                                    .font(.headline)
                                    .padding(.top, 10)
                            } else {
                                Text(line.text)
                                    .font(.body)
                            }
                        }
                        AsyncImage(url: URL(string: "https://prognoza.hr/podjela_jadran.gif")) { img in
                            img.resizable().scaledToFit()
                        } placeholder: {
                            EmptyView()
                        }
                        .padding(.top, 16)
                        Link("Otvori na meteo.hr", destination: NauticalStore.pageURL)
                            .padding(.top, 8)
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .refreshable { await store.load() }
            .task { await store.load() }
    }
}
