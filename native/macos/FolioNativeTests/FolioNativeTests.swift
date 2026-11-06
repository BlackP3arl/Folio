import PDFKit
import XCTest
@testable import FolioNative

final class FolioNativeTests: XCTestCase {
    @MainActor
    func testRecentPDFIdentityUsesItsPath() {
        let recent = RecentPDF(name: "Example.pdf", urlPath: "/Documents/Example.pdf", bookmark: Data([1, 2, 3]))
        XCTAssertEqual(recent.id, "/Documents/Example.pdf")
    }

    @MainActor
    func testEmptyStoreStartsWithoutDocument() {
        let store = PDFDocumentStore()
        XCTAssertNil(store.document)
        XCTAssertEqual(store.pageCount, 0)
        XCTAssertEqual(store.currentPage, 0)
        XCTAssertFalse(store.isDirty)
    }
}
