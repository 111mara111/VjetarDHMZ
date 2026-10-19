import SwiftUI

@main
struct VjetarDHMZApp: App {
    init() {
        UserDefaults.standard.register(defaults: [
            AppSettings.playInterval: 0.35,
            AppSettings.playStep: 1,
            AppSettings.loopPlayback: true,
            AppSettings.defaultRegion: Region.zadar.rawValue
        ])
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

struct RootView: View {
    enum Mode { case maps, nautical }

    @StateObject private var store = ForecastStore()
    @State private var mode: Mode = .maps
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Group {
                switch mode {
                case .maps: MapsView(store: store)
                case .nautical: NauticalView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onChange(of: mode) { _, _ in store.stop() }
        .sheet(isPresented: $showSettings) { SettingsView(store: store) }
    }

    // MARK: - Small tab bar

    private var topBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 5) {
            ForEach(Region.coastal + [.croatia]) { region in
                chip(region.shortTitle,
                     selected: mode == .maps && store.layer == .wind && store.region == region) {
                    mode = .maps
                    store.layer = .wind
                    store.region = region
                }
            }

            Spacer(minLength: 2)

            Menu {
                ForEach(Layer.allCases) { layer in
                    Button {
                        mode = .maps
                        store.layer = layer
                    } label: {
                        if layer == store.layer {
                            Label(layer.title, systemImage: "checkmark")
                        } else {
                            Text(layer.title)
                        }
                    }
                }
            } label: {
                iconLabel("square.3.layers.3d", selected: mode == .maps && store.layer != .wind)
            }

            Button { store.stop(); mode = .nautical } label: {
                iconLabel("sailboat", selected: mode == .nautical)
            }
            .accessibilityLabel("Nautičari")

            Button { showSettings = true } label: {
                iconLabel("gearshape", selected: false)
            }
            .accessibilityLabel("Postavke")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        }
        .background(.bar)
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .padding(.horizontal, 9)
                .frame(height: 26)
                .foregroundStyle(selected ? Color.white : Color.primary)
                .background(selected ? Color.accentColor : Color(.secondarySystemFill),
                            in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func iconLabel(_ name: String, selected: Bool) -> some View {
        Image(systemName: name)
            .font(.system(size: 13, weight: .semibold))
            .frame(width: 28, height: 26)
            .foregroundStyle(selected ? Color.white : Color.primary)
            .background(selected ? Color.accentColor : Color(.secondarySystemFill),
                        in: Capsule())
    }
}
