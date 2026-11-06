import PDFKit
import SwiftUI

struct ThumbnailSidebar: View {
    @ObservedObject var store: PDFDocumentStore

    var body: some View {
        ScrollViewReader { proxy in
            List(0..<store.pageCount, id: \.self, selection: Binding(
                get: { store.currentPage },
                set: { store.go(to: $0) }
            )) { index in
                ThumbnailRow(document: store.document, index: index, selected: index == store.currentPage)
                    .tag(index)
                    .id(index)
            }
            .listStyle(.sidebar)
            .onChange(of: store.currentPage) { _, page in
                withAnimation(.easeOut(duration: 0.15)) { proxy.scrollTo(page, anchor: .center) }
            }
        }
        .navigationTitle("Pages")
        .frame(minWidth: 160, idealWidth: 190, maxWidth: 230)
    }
}

private struct ThumbnailRow: View {
    let document: PDFDocument?
    let index: Int
    let selected: Bool

    var body: some View {
        VStack(spacing: 6) {
            if let page = document?.page(at: index) {
                Image(nsImage: page.thumbnail(of: CGSize(width: 130, height: 170), for: .cropBox))
                    .resizable()
                    .scaledToFit()
                    .background(.white)
                    .shadow(color: .black.opacity(0.16), radius: 3, y: 1)
                    .accessibilityLabel("Page \(index + 1) thumbnail")
            }
            Text("\(index + 1)")
                .font(.caption)
                .foregroundStyle(selected ? Color.accentColor : .secondary)
        }
        .padding(.vertical, 5)
    }
}
