import SwiftUI

struct SettingsView: View {
    @ObservedObject var store: ForecastStore
    @Environment(\.dismiss) private var dismiss

    @AppStorage(AppSettings.playInterval) private var interval = 0.35
    @AppStorage(AppSettings.playStep) private var step = 1
    @AppStorage(AppSettings.loopPlayback) private var loop = true
    @AppStorage(AppSettings.defaultRegion) private var defaultRegion = Region.zadar.rawValue

    var body: some View {
        NavigationStack {
            Form {
                Section("Animacija") {
                    VStack(alignment: .leading) {
                        Text("Brzina: \(interval, specifier: "%.2f") s po slici")
                        Slider(value: $interval, in: 0.15...1.0, step: 0.05)
                    }
                    Picker("Korak", selection: $step) {
                        Text("1 sat").tag(1)
                        Text("2 sata").tag(2)
                        Text("3 sata").tag(3)
                        Text("6 sati").tag(6)
                    }
                    Toggle("Ponavljaj", isOn: $loop)
                }

                Section("Početna regija") {
                    Picker("Regija", selection: $defaultRegion) {
                        ForEach(Region.allCases) { Text($0.title).tag($0.rawValue) }
                    }
                }

                Section {
                    Button("Osvježi podatke") {
                        store.refresh()
                        dismiss()
                    }
                    Button("Očisti predmemoriju", role: .destructive) {
                        store.clearCache()
                    }
                }

                Section("O aplikaciji") {
                    Text("Karte i tekstualne prognoze pripadaju Državnom hidrometeorološkom zavodu (DHMZ). Ovo je neslužbena aplikacija; za sigurnost plovidbe uvijek provjerite službenu prognozu.")
                        .font(.footnote)
                    Link("meteo.hr – 3 dana karte",
                         destination: URL(string: "https://meteo.hr/prognoze.php?section=prognoze_model&param=ala_k")!)
                }
            }
            .navigationTitle("Postavke")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Gotovo") { dismiss() }
                }
            }
        }
    }
}
