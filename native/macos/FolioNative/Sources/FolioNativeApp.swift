import SwiftUI

@main
struct FolioNativeApp: App {
    @StateObject private var store = PDFDocumentStore()

    var body: some Scene {
        WindowGroup {
            ContentView(store: store)
                .onOpenURL { store.open($0) }
        }
        .defaultSize(width: 1180, height: 780)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open…", action: store.choosePDF)
                    .keyboardShortcut("o", modifiers: .command)
                Divider()
                Button("Close Document", action: store.closeDocument)
                    .keyboardShortcut("w", modifiers: .command)
                    .disabled(store.document == nil)
            }
            CommandGroup(replacing: .saveItem) {
                Button("Save", action: store.save)
                    .keyboardShortcut("s", modifiers: .command)
                    .disabled(store.document == nil)
                Button("Save As…", action: store.saveAs)
                    .keyboardShortcut("s", modifiers: [.command, .shift])
                    .disabled(store.document == nil)
            }
            CommandGroup(after: .saveItem) {
                Button("Print…", action: store.printDocument)
                    .keyboardShortcut("p", modifiers: .command)
                    .disabled(store.document == nil)
            }
            CommandMenu("PDF") {
                Button("Previous Page", action: store.previousPage)
                    .keyboardShortcut(.pageUp, modifiers: [])
                Button("Next Page", action: store.nextPage)
                    .keyboardShortcut(.pageDown, modifiers: [])
                Divider()
                Button("Highlight Selection", action: store.highlightSelection)
                Button("Add Note", action: store.addNote)
                Button("Rotate Page Right", action: store.rotateCurrentPage)
                Divider()
                Button("Actual Size", action: store.actualSize)
                    .keyboardShortcut("0", modifiers: .command)
                Button("Fit Page", action: store.fitPage)
                    .keyboardShortcut("9", modifiers: .command)
            }
        }
    }
}
