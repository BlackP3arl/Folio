import AppKit
import Foundation
import PDFKit
import UniformTypeIdentifiers

@MainActor
final class PDFDocumentStore: ObservableObject {
    @Published private(set) var document: PDFDocument?
    @Published private(set) var fileURL: URL?
    @Published private(set) var title = "Folio Native"
    @Published private(set) var pageCount = 0
    @Published var currentPage = 0
    @Published var scaleFactor: CGFloat = 1
    @Published var sidebarVisible = true
    @Published private(set) var isDirty = false
    @Published var statusMessage: String?
    @Published private(set) var recentDocuments: [RecentPDF] = []

    weak var pdfView: PDFView?
    private var securityScopedURL: URL?
    private let recentKey = "folio.native.recent"

    init() {
        recentDocuments = loadRecents()
    }

    deinit {
        securityScopedURL?.stopAccessingSecurityScopedResource()
    }

    func choosePDF() {
        guard confirmDiscardIfNeeded() else { return }
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.pdf]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = "Choose a PDF to open in Folio Native"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        open(url)
    }

    func open(_ url: URL) {
        guard confirmDiscardIfNeeded() else { return }
        let accessed = url.startAccessingSecurityScopedResource()
        guard let loaded = PDFDocument(url: url) else {
            if accessed { url.stopAccessingSecurityScopedResource() }
            presentError("Folio Native couldn't open \(url.lastPathComponent).")
            return
        }
        securityScopedURL?.stopAccessingSecurityScopedResource()
        securityScopedURL = accessed ? url : nil
        document = loaded
        fileURL = url
        title = url.deletingPathExtension().lastPathComponent
        pageCount = loaded.pageCount
        currentPage = 0
        scaleFactor = 1
        isDirty = false
        statusMessage = "Opened \(url.lastPathComponent)"
        remember(url)
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
    }

    func openRecent(_ recent: RecentPDF) {
        do {
            var stale = false
            let url = try URL(resolvingBookmarkData: recent.bookmark, options: [.withSecurityScope],
                              relativeTo: nil, bookmarkDataIsStale: &stale)
            if stale { remember(url) }
            open(url)
        } catch {
            removeRecent(recent)
            presentError("That recent PDF is no longer available.")
        }
    }

    func closeDocument() {
        guard confirmDiscardIfNeeded() else { return }
        securityScopedURL?.stopAccessingSecurityScopedResource()
        securityScopedURL = nil
        document = nil
        fileURL = nil
        title = "Folio Native"
        pageCount = 0
        currentPage = 0
        isDirty = false
        statusMessage = nil
    }

    func go(to index: Int) {
        guard let document, document.pageCount > 0 else { return }
        let pageIndex = min(max(index, 0), document.pageCount - 1)
        if let page = document.page(at: pageIndex) { pdfView?.go(to: page) }
        currentPage = pageIndex
    }

    func previousPage() { go(to: currentPage - 1) }
    func nextPage() { go(to: currentPage + 1) }
    func zoomIn() { pdfView?.zoomIn(nil) }
    func zoomOut() { pdfView?.zoomOut(nil) }
    func actualSize() { pdfView?.scaleFactor = 1 }
    func fitPage() { pdfView?.autoScales = true }

    func highlightSelection() {
        guard let selection = pdfView?.currentSelection, !selection.string.orEmpty.isEmpty else {
            statusMessage = "Select text in the PDF first."
            return
        }
        for page in selection.pages {
            let bounds = selection.bounds(for: page)
            guard !bounds.isEmpty else { continue }
            let annotation = PDFAnnotation(bounds: bounds, forType: .highlight, withProperties: nil)
            annotation.color = NSColor.systemYellow.withAlphaComponent(0.45)
            page.addAnnotation(annotation)
        }
        pdfView?.clearSelection()
        markDirty("Highlight added")
    }

    func addNote() {
        guard let page = document?.page(at: currentPage) else { return }
        let pageBounds = page.bounds(for: .cropBox)
        let bounds = CGRect(x: pageBounds.midX - 90, y: pageBounds.midY - 30, width: 180, height: 60)
        let annotation = PDFAnnotation(bounds: bounds, forType: .freeText, withProperties: nil)
        annotation.contents = "Note"
        annotation.font = .systemFont(ofSize: 13)
        annotation.fontColor = .labelColor
        annotation.color = .systemYellow.withAlphaComponent(0.18)
        annotation.interiorColor = .systemYellow.withAlphaComponent(0.12)
        page.addAnnotation(annotation)
        markDirty("Note added")
    }

    func rotateCurrentPage() {
        guard let page = document?.page(at: currentPage) else { return }
        page.rotation = (page.rotation + 90) % 360
        markDirty("Page rotated")
    }

    func save() {
        guard let document else { return }
        if let fileURL {
            write(document, to: fileURL)
        } else {
            saveAs()
        }
    }

    func saveAs() {
        guard let document else { return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.pdf]
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = (fileURL?.deletingPathExtension().lastPathComponent ?? title) + " signed.pdf"
        guard panel.runModal() == .OK, let destination = panel.url else { return }
        write(document, to: destination)
    }

    func printDocument() {
        guard let document else { return }
        let operation = document.printOperation(
            for: NSPrintInfo.shared,
            scalingMode: .pageScaleToFit,
            autoRotate: true
        )
        operation?.run()
    }

    func updateFromPDFView(page: PDFPage?, scale: CGFloat) {
        if let page, let document { currentPage = max(0, document.index(for: page)) }
        scaleFactor = scale
    }

    private func write(_ document: PDFDocument, to url: URL) {
        guard document.write(to: url) else {
            presentError("Folio Native couldn't save \(url.lastPathComponent).")
            return
        }
        fileURL = url
        title = url.deletingPathExtension().lastPathComponent
        isDirty = false
        statusMessage = "Saved \(url.lastPathComponent)"
        remember(url)
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
    }

    private func markDirty(_ message: String) {
        isDirty = true
        statusMessage = message
    }

    private func confirmDiscardIfNeeded() -> Bool {
        guard isDirty else { return true }
        let alert = NSAlert()
        alert.messageText = "Save changes to \(title)?"
        alert.informativeText = "Your annotations and page changes have not been saved."
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: "Discard")
        switch alert.runModal() {
        case .alertFirstButtonReturn: save(); return !isDirty
        case .alertThirdButtonReturn: return true
        default: return false
        }
    }

    private func presentError(_ message: String) {
        statusMessage = message
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = message
        alert.runModal()
    }

    private func remember(_ url: URL) {
        guard let bookmark = try? url.bookmarkData(options: [.withSecurityScope], includingResourceValuesForKeys: [.contentModificationDateKey], relativeTo: nil) else { return }
        recentDocuments.removeAll { $0.urlPath == url.path }
        recentDocuments.insert(RecentPDF(name: url.lastPathComponent, urlPath: url.path, bookmark: bookmark), at: 0)
        recentDocuments = Array(recentDocuments.prefix(12))
        saveRecents()
    }

    private func removeRecent(_ recent: RecentPDF) {
        recentDocuments.removeAll { $0.id == recent.id }
        saveRecents()
    }

    private func loadRecents() -> [RecentPDF] {
        guard let data = UserDefaults.standard.data(forKey: recentKey) else { return [] }
        return (try? JSONDecoder().decode([RecentPDF].self, from: data)) ?? []
    }

    private func saveRecents() {
        if let data = try? JSONEncoder().encode(recentDocuments) { UserDefaults.standard.set(data, forKey: recentKey) }
    }
}

struct RecentPDF: Codable, Identifiable, Hashable {
    let name: String
    let urlPath: String
    let bookmark: Data
    var id: String { urlPath }
}

private extension Optional where Wrapped == String {
    var orEmpty: String { self ?? "" }
}
