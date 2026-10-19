import Foundation

enum AppSettings {
    static let playInterval = "playInterval"      // seconds per frame
    static let playStep = "playStep"              // hours per frame
    static let loopPlayback = "loopPlayback"
    static let defaultRegion = "defaultRegion"
}

/// Wind-map regions. `code` is the part of the DHMZ file name:
/// https://prognoza.hr/aladinHR/web_uv10_<code>_<NN>.png
enum Region: String, CaseIterable, Identifiable {
    case croatia, istraKvarner, zadar, split, dubrovnik

    var id: String { rawValue }

    var title: String {
        switch self {
        case .croatia: return "Hrvatska"
        case .istraKvarner: return "Istra + Kvarner"
        case .zadar: return "Zadar"
        case .split: return "Split"
        case .dubrovnik: return "Dubrovnik"
        }
    }

    var shortTitle: String {
        switch self {
        case .croatia: return "HR"
        case .istraKvarner: return "Istra + Kvarner"
        case .zadar: return "Zadar"
        case .split: return "Split"
        case .dubrovnik: return "Dubr."
        }
    }

    var windPrefix: String {
        switch self {
        case .croatia: return "web_uv10_HRv8_"
        case .istraKvarner: return "web_uv10_SENJ_"
        case .zadar: return "web_uv10_MASL_"
        case .split: return "web_uv10_SPLI_"
        case .dubrovnik: return "web_uv10_DUBR_"
        }
    }

    /// The four buttons from the reference screenshot.
    static let coastal: [Region] = [.istraKvarner, .zadar, .split, .dubrovnik]
}

/// Map layers available on DHMZ "3 dana karte".
enum Layer: String, CaseIterable, Identifiable {
    case wind, temperature, clouds, rain

    var id: String { rawValue }

    var title: String {
        switch self {
        case .wind: return "Vjetar"
        case .temperature: return "Temp."
        case .clouds: return "Oblaci"
        case .rain: return "Oborina"
        }
    }

    var heading: String {
        switch self {
        case .wind: return "VJETAR na 10m"
        case .temperature: return "TEMPERATURA na 2m"
        case .clouds: return "NAOBLAKA"
        case .rain: return "OBORINA (mm/1h)"
        }
    }

    /// Only the wind layer has regional variants.
    func prefix(for region: Region) -> String {
        switch self {
        case .wind: return region.windPrefix
        case .temperature: return "web_t02m_"
        case .clouds: return "web_naob_"
        case .rain: return "web_ob_uk_"
        }
    }
}

enum Zagreb {
    static let timeZone = TimeZone(identifier: "Europe/Zagreb")!
    static let locale = Locale(identifier: "hr_HR")

    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        c.locale = locale
        return c
    }

    static func format(_ date: Date, _ pattern: String) -> String {
        let f = DateFormatter()
        f.locale = locale
        f.timeZone = timeZone
        f.dateFormat = pattern
        return f.string(from: date)
    }

    static func dayLabel(for date: Date) -> String {
        let cal = calendar
        let diff = cal.dateComponents([.day],
                                      from: cal.startOfDay(for: Date()),
                                      to: cal.startOfDay(for: date)).day ?? 0
        switch diff {
        case 0: return "Danas"
        case 1: return "Sutra"
        case 2: return "Prekosutra"
        default: return format(date, "EEEE").capitalized
        }
    }
}
