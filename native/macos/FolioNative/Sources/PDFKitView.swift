import PDFKit
import SwiftUI

struct PDFKitView: NSViewRepresentable {
    @ObservedObject var store: PDFDocumentStore

    func makeCoordinator() -> Coordinator { Coordinator(store: store) }

    func makeNSView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.displaysPageBreaks = true
        view.pageBreakMargins = NSEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
        view.backgroundColor = NSColor.windowBackgroundColor.blended(withFraction: 0.35, of: .black) ?? .windowBackgroundColor
        view.delegate = context.coordinator
        store.pdfView = view
        context.coordinator.observe(view)
        return view
    }

    func updateNSView(_ view: PDFView, context: Context) {
        if view.document !== store.document {
            view.document = store.document
            view.autoScales = true
        }
    }

    static func dismantleNSView(_ view: PDFView, coordinator: Coordinator) {
        coordinator.stopObserving()
    }

    @MainActor
    final class Coordinator: NSObject, PDFViewDelegate {
        private weak var store: PDFDocumentStore?
        private weak var view: PDFView?
        private var observers: [NSObjectProtocol] = []

        init(store: PDFDocumentStore) { self.store = store }

        func observe(_ view: PDFView) {
            self.view = view
            let center = NotificationCenter.default
            observers.append(center.addObserver(forName: .PDFViewPageChanged, object: view, queue: .main) { [weak self, weak view] _ in
                guard let self, let view else { return }
                Task { @MainActor in self.store?.updateFromPDFView(page: view.currentPage, scale: view.scaleFactor) }
            })
            observers.append(center.addObserver(forName: .PDFViewScaleChanged, object: view, queue: .main) { [weak self, weak view] _ in
                guard let self, let view else { return }
                Task { @MainActor in self.store?.updateFromPDFView(page: view.currentPage, scale: view.scaleFactor) }
            })
        }

        func stopObserving() {
            for observer in observers { NotificationCenter.default.removeObserver(observer) }
            observers.removeAll()
        }
    }
}
