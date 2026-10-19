import SwiftUI

@MainActor
final class ForecastStore: ObservableObject {
    static let maxHour = 72
    private static let base = "https://prognoza.hr/aladinHR/"

    @Published var layer: Layer = .wind {
        didSet { if oldValue != layer { stop(); bootstrap() } }
    }
    @Published var region: Region {
        didSet { if oldValue != region { stop(); bootstrap() } }
    }
    @Published var hour: Int = 0 {
        didSet { if oldValue != hour { loadCurrent() } }
    }

    @Published private(set) var image: UIImage?
    @Published private(set) var isLoading = false
    @Published private(set) var failed = false
    @Published private(set) var runStart: Date?
    @Published private(set) var isPlaying = false
    @Published private(set) var isPreloading = false

    private var token = ForecastStore.makeToken()
    private var loadTask: Task<Void, Never>?
    private var playTask: Task<Void, Never>?
    private var lastRefresh = Date()

    init() {
        let saved = UserDefaults.standard.string(forKey: AppSettings.defaultRegion) ?? ""
        region = Region(rawValue: saved) ?? .zadar
    }

    // MARK: - Derived

    var validDate: Date? {
        runStart?.addingTimeInterval(Double(hour) * 3600)
    }

    /// Clock hour (Europe/Zagreb) of forecast frame `h`.
    func hourOfDay(_ h: Int) -> Int? {
        guard let r = runStart else { return nil }
        return Zagreb.calendar.component(.hour, from: r.addingTimeInterval(Double(h) * 3600))
    }

    func dayShort(_ h: Int) -> String {
        guard let r = runStart else { return "Vrijeme modela nepoznato · +\(hour)h" }
        return Zagreb.format(r.addingTimeInterval(Double(h) * 3600), "EEE d.").capitalized
    }

    var headerTitle: String {
        guard let d = validDate else { return "—" }
        return Zagreb.format(d, "dd.MM.yyyy - HH:mm")
    }

    var headerSubtitle: String {
        guard let d = validDate else { return "" }
        return "\(Zagreb.dayLabel(for: d)), \(Zagreb.format(d, "EEEE"))"
    }

    var runCaption: String {
        guard let r = runStart else { return "Vrijeme modela nepoznato · +\(hour)h" }
        return "Model: \(Zagreb.format(r, "dd.MM. HH:mm")) · +\(hour)h"
    }

    private static func makeToken() -> Int {
        Int(Date().timeIntervalSince1970 / 900) // changes every 15 min
    }

    func url(hour: Int) -> URL {
        let name = layer.prefix(for: region) + String(format: "%02d", hour) + ".png"
        return URL(string: "\(Self.base)\(name)?v=\(token)")!
    }

    // MARK: - Loading

    /// First load: fetch frame 0, read the model start time from the image caption,
    /// then jump to the frame that matches "now".
    func bootstrap() {
        loadTask?.cancel()
        loadTask = Task { [weak self] in
            guard let self else { return }
            self.isLoading = true
            self.failed = false
            self.image = nil
            self.runStart = nil
            let first = await ImageLoader.shared.image(for: self.url(hour: 0))
            guard !Task.isCancelled else { return }

            var start: Date?
            if let first { start = await RunStartReader.read(from: first) }
            self.runStart = start
            guard let run = start else { self.loadCurrent(); return }

            let nowHour = Int((Date().timeIntervalSince(run) / 3600).rounded())
            let target = min(max(nowHour, 0), Self.maxHour)
            if target == self.hour {
                self.loadCurrent()
            } else {
                self.hour = target // didSet loads the frame
            }
        }
    }

    func refresh() {
        stop()
        token = Self.makeToken()
        lastRefresh = Date()
        runStart = nil
        Task {
            await ImageLoader.shared.clear()
            bootstrap()
        }
    }

    func refreshIfStale() {
        if Date().timeIntervalSince(lastRefresh) > 30 * 60 { refresh() }
    }

    func clearCache() {
        Task { await ImageLoader.shared.clear() }
    }

    private func loadCurrent() {
        loadTask?.cancel()
        let target = url(hour: hour)
        let requestedHour = hour
        loadTask = Task { [weak self] in
            guard let self else { return }
            self.isLoading = true
            self.failed = false
            let img = await ImageLoader.shared.image(for: target)
            guard !Task.isCancelled, requestedHour == self.hour else { return }
            self.isLoading = false
            if let img {
                self.image = img
                self.failed = false
            } else {
                self.image = nil
                self.failed = true
            }
        }
    }

    // MARK: - Animation

    func togglePlay() {
        isPlaying ? stop() : play()
    }

    func stop() {
        isPlaying = false
        playTask?.cancel()
        playTask = nil
    }

    private func play() {
        let defaults = UserDefaults.standard
        let step = max(1, defaults.integer(forKey: AppSettings.playStep))
        let interval = max(0.1, defaults.double(forKey: AppSettings.playInterval))
        let loop = defaults.bool(forKey: AppSettings.loopPlayback)

        if hour >= Self.maxHour { hour = 0 }
        isPlaying = true
        playTask?.cancel()
        playTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled && self.isPlaying {
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
                guard !Task.isCancelled, self.isPlaying else { break }
                var next = self.hour + step
                if next > Self.maxHour {
                    if loop { next = 0 } else { self.isPlaying = false; break }
                }
                self.hour = next
                await self.loadTask?.value
                if self.failed { self.stop(); break }
            }
        }
    }

    private func preloadAll(step: Int) async {
        isPreloading = true
        defer { isPreloading = false }
        let hours = Array(stride(from: 0, through: Self.maxHour, by: step))
        var i = 0
        while i < hours.count {
            if Task.isCancelled { return }
            let urls = hours[i..<min(i + 6, hours.count)].map { url(hour: $0) }
            await withTaskGroup(of: Void.self) { group in
                for u in urls {
                    group.addTask { _ = await ImageLoader.shared.image(for: u) }
                }
            }
            i += 6
        }
    }
}
