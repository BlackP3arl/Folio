import SwiftUI

struct ContentView: View {
    @ObservedObject var store: PDFDocumentStore

    var body: some View {
        Group {
            if store.document == nil {
                WelcomeView(store: store)
            } else {
                reader
            }
        }
        .frame(minWidth: 720, minHeight: 520)
        .navigationTitle(store.title + (store.isDirty ? " — Edited" : ""))
        .toolbar { toolbar }
    }

    private var reader: some View {
        NavigationSplitView(columnVisibility: Binding(
            get: { store.sidebarVisible ? .all : .detailOnly },
            set: { store.sidebarVisible = $0 != .detailOnly }
        )) {
            ThumbnailSidebar(store: store)
        } detail: {
            VStack(spacing: 0) {
                PDFKitView(store: store)
                Divider()
                statusBar
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .navigation) {
            Button { store.sidebarVisible.toggle() } label: { Label("Toggle Sidebar", systemImage: "sidebar.left") }
                .keyboardShortcut("s", modifiers: [.command, .control])
                .disabled(store.document == nil)
            Button { store.choosePDF() } label: { Label("Open PDF", systemImage: "folder") }
                .keyboardShortcut("o", modifiers: .command)
        }
        ToolbarItemGroup {
            Button(action: store.previousPage) { Label("Previous Page", systemImage: "chevron.up") }
                .disabled(store.currentPage <= 0)
            TextField("Page", value: Binding(
                get: { store.currentPage + 1 },
                set: { store.go(to: $0 - 1) }
            ), format: .number)
                .frame(width: 42)
                .multilineTextAlignment(.center)
                .disabled(store.document == nil)
            Text("of \(store.pageCount)").foregroundStyle(.secondary).monospacedDigit()
            Button(action: store.nextPage) { Label("Next Page", systemImage: "chevron.down") }
                .disabled(store.currentPage + 1 >= store.pageCount)
        }
        ToolbarItemGroup {
            Button(action: store.zoomOut) { Label("Zoom Out", systemImage: "minus.magnifyingglass") }
                .keyboardShortcut("-", modifiers: .command)
            Button(action: store.fitPage) { Text("\(Int(store.scaleFactor * 100))%").monospacedDigit() }
                .help("Fit page")
            Button(action: store.zoomIn) { Label("Zoom In", systemImage: "plus.magnifyingglass") }
                .keyboardShortcut("+", modifiers: .command)
        }
        ToolbarItemGroup {
            Button(action: store.highlightSelection) { Label("Highlight", systemImage: "highlighter") }
                .disabled(store.document == nil)
            Button(action: store.addNote) { Label("Add Note", systemImage: "note.text.badge.plus") }
                .disabled(store.document == nil)
            Button(action: store.rotateCurrentPage) { Label("Rotate", systemImage: "rotate.right") }
                .keyboardShortcut("r", modifiers: .command)
                .disabled(store.document == nil)
        }
    }

    private var statusBar: some View {
        HStack {
            Text(store.statusMessage ?? (store.isDirty ? "Unsaved changes" : "Ready"))
                .foregroundStyle(store.isDirty ? Color.orange : .secondary)
            Spacer()
            if store.isDirty { Text("Edited").foregroundStyle(.orange) }
        }
        .font(.caption)
        .padding(.horizontal, 10)
        .frame(height: 26)
        .background(.bar)
    }
}

private struct WelcomeView: View {
    @ObservedObject var store: PDFDocumentStore

    var body: some View {
        VStack(spacing: 22) {
            Spacer()
            Image(systemName: "doc.richtext")
                .font(.system(size: 58, weight: .light))
                .foregroundStyle(.tint)
            VStack(spacing: 7) {
                Text("Folio Native").font(.largeTitle.bold())
                Text("A SwiftUI and PDFKit reader built specifically for macOS.")
                    .foregroundStyle(.secondary)
            }
            Button("Open a PDF…", action: store.choosePDF)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            if !store.recentDocuments.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Recent").font(.headline)
                    ForEach(store.recentDocuments.prefix(6)) { recent in
                        Button { store.openRecent(recent) } label: {
                            Label(recent.name, systemImage: "doc")
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .help(recent.urlPath)
                    }
                }
                .padding(16)
                .frame(width: 360)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
            }
            Spacer()
        }
        .padding(32)
    }
}
