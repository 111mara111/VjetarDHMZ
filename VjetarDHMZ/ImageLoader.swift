import UIKit
import Vision

/// Downloads and caches forecast frames in memory.
actor ImageLoader {
    static let shared = ImageLoader()

    private let cache = NSCache<NSString, UIImage>()
    private var inflight: [String: Task<UIImage?, Never>] = [:]
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 20
        config.httpMaximumConnectionsPerHost = 6
        session = URLSession(configuration: config)
        cache.countLimit = 160
    }

    func image(for url: URL) async -> UIImage? {
        let key = url.absoluteString
        if let hit = cache.object(forKey: key as NSString) { return hit }
        if let running = inflight[key] { return await running.value }

        let session = self.session
        let task = Task<UIImage?, Never> {
            guard let (data, response) = try? await session.data(from: url),
                  (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            return UIImage(data: data)
        }
        inflight[key] = task
        let result = await task.value
        inflight[key] = nil
        if let result { cache.setObject(result, forKey: key as NSString) }
        return result
    }

    func clear() {
        cache.removeAllObjects()
    }
}

/// The DHMZ images carry a caption like "START MODELA: 19.10.2026 08".
/// We read it with on-device OCR so the app knows which model run it is looking at
/// and can show the real valid time for every frame.
enum RunStartReader {
    static func read(from image: UIImage) async -> Date? {
        guard let cg = image.cgImage else { return nil }
        return await Task.detached(priority: .utility) { () -> Date? in
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            do {
                try VNImageRequestHandler(cgImage: cg).perform([request])
            } catch {
                return nil
            }
            let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
            return parse(lines)
        }.value
    }

    static func parse(_ lines: [String]) -> Date? {
        let text = lines.joined(separator: " ")
        let pattern = #"START\s*MODELA:?\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2})"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let m = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))
        else { return nil }

        func num(_ i: Int) -> Int? {
            guard let r = Range(m.range(at: i), in: text) else { return nil }
            return Int(text[r])
        }
        guard let d = num(1), let mo = num(2), let y = num(3), let h = num(4) else { return nil }
        var comps = DateComponents()
        comps.year = y; comps.month = mo; comps.day = d; comps.hour = h
        return Zagreb.calendar.date(from: comps)
    }

    /// Used if OCR fails: ALADIN runs at 00/06/12/18 UTC and is published a few hours later.
    static func fallbackRunStart(now: Date = Date()) -> Date {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let lagged = now.addingTimeInterval(-4 * 3600)
        var c = utc.dateComponents([.year, .month, .day, .hour], from: lagged)
        c.hour = (c.hour! / 6) * 6
        return utc.date(from: c) ?? now
    }
}
