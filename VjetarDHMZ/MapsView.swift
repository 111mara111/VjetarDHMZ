import SwiftUI

/// Full-screen map with a compact bottom control bar (play + hour/day timeline).
struct MapsView: View {
    @ObservedObject var store: ForecastStore
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Color.white
                if let img = store.image {
                    ZoomableImage(image: img)
                        .id("\(store.region.rawValue)-\(store.layer.rawValue)")
                } else if !store.failed {
                    ProgressView()
                }
                if store.failed {
                    VStack(spacing: 6) {
                        Image(systemName: "wifi.exclamationmark").font(.title)
                        Text("Karta nije dostupna").font(.subheadline)
                        Button("Pokušaj ponovno") { store.refresh() }
                            .buttonStyle(.bordered)
                    }
                    .foregroundStyle(.black.opacity(0.7))
                }
            }
            .overlay(alignment: .topTrailing) {
                if store.isLoading && store.image != nil {
                    Color.white.opacity(0.96)
                        .overlay { ProgressView("Učitavam kartu…").font(.caption) }
                }
            }
            .clipped()

            controls
        }
        .task { store.bootstrap() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { store.refreshIfStale() }
            else { store.stop() }
        }
    }

    private var controls: some View {
        VStack(spacing: 2) {
            HStack(spacing: 10) {
                Button { store.togglePlay() } label: {
                    HStack(spacing: 5) {
                    Image(systemName: store.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 12, weight: .bold))
                    Text(store.isPlaying ? "Pauza" : "Pokreni")
                        .font(.system(size: 12, weight: .semibold))
                    }
                    .padding(.horizontal, 10).frame(height: 34)
                    .background(Color.accentColor, in: Capsule())
                    .foregroundStyle(.white)
                }
                .accessibilityLabel(store.isPlaying ? "Pauza" : "Pokreni")

                VStack(alignment: .leading, spacing: 0) {
                    Text(store.validDate.map { Zagreb.format($0, "EEE dd.MM. HH:mm").capitalized } ?? "—")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    Text(store.isPreloading ? "Učitavam slike…" : store.runCaption)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                Spacer()
                Text(store.layer.heading)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.top, 6)

            TimelineScrubber(store: store)
                .padding(.horizontal, 14)
        }
        .padding(.bottom, 2)
        .background(.bar)
    }
}

// MARK: - Timeline (hours + days)

struct TimelineScrubber: View {
    @ObservedObject var store: ForecastStore

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach([0, 24, 48, 72], id: \.self) { hour in
                    VStack(spacing: 2) {
                        if let start = store.runStart {
                            let date = start.addingTimeInterval(Double(hour) * 3600)
                            Text(Zagreb.dayLabel(for: date))
                            Text(Zagreb.format(date, "dd.MM. HH:mm"))
                                .foregroundStyle(.secondary)
                        } else {
                            Text("+\(hour) h")
                        }
                    }
                    .font(.system(size: 9, weight: .medium))
                    .frame(maxWidth: .infinity)
                }
            }
            Slider(value: Binding(get: { Double(store.hour) }, set: {
                store.stop(); store.hour = Int($0)
            }), in: 0...Double(ForecastStore.maxHour), step: 1)
            .accessibilityLabel("Sat prognoze")
            .accessibilityValue("+\(store.hour) sati")
            HStack {
                ForEach(Array(stride(from: 0, through: 72, by: 12)), id: \.self) { hour in
                    Text("\(hour)h").font(.system(size: 9)).foregroundStyle(.secondary)
                    if hour != 72 { Spacer(minLength: 0) }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Pinch-to-zoom map

struct ZoomableImage: View {
    let image: UIImage

    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    @State private var fit = false

    var body: some View {
        GeometryReader { geo in
            let fitScale = min(geo.size.width / image.size.width, geo.size.height / image.size.height)
            let fillScale = max(geo.size.width / image.size.width, geo.size.height / image.size.height)
            let base = fit ? fitScale : fillScale
            Image(uiImage: image)
                .resizable()
                .frame(width: image.size.width * base, height: image.size.height * base)
                .scaleEffect(scale)
                .offset(offset)
                .position(x: geo.size.width / 2, y: geo.size.height / 2)
                .gesture(MagnifyGesture()
                    .onChanged { scale = min(max(lastScale * $0.magnification, 1), 6) }
                    .onEnded { _ in lastScale = scale; clamp(in: geo.size, base: base) })
                .simultaneousGesture(DragGesture()
                    .onChanged { v in
                        offset = CGSize(width: lastOffset.width + v.translation.width,
                                        height: lastOffset.height + v.translation.height)
                        clamp(in: geo.size, base: base, commit: false)
                    }
                    .onEnded { _ in lastOffset = offset })
                .onTapGesture(count: 2) { fit.toggle(); reset() }
                .onChange(of: geo.size) { _, _ in reset() }
        }
        .clipped()
        .overlay(alignment: .bottomTrailing) {
            Button { fit.toggle(); reset() } label: {
                Label(fit ? "Ispuni ekran" : "Cijela karta", systemImage: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 11, weight: .medium))
                    .padding(8).background(.regularMaterial, in: Capsule())
            }
            .padding(8)
        }
    }

    private func clamp(in size: CGSize, base: CGFloat, commit: Bool = true) {
        let x = max(0, (image.size.width * base * scale - size.width) / 2)
        let y = max(0, (image.size.height * base * scale - size.height) / 2)
        offset.width = min(max(offset.width, -x), x)
        offset.height = min(max(offset.height, -y), y)
        if commit { lastOffset = offset }
    }

    private func reset() {
        scale = 1; lastScale = 1
        offset = .zero; lastOffset = .zero
    }
}
