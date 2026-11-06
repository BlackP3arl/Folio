# Folio Native for macOS

Folio Native is a separate macOS application built with SwiftUI, AppKit, and PDFKit. It lives beside the existing Electron application so the Windows, Linux, and current macOS builds remain unchanged while native functionality is developed incrementally.

## Current foundation

- Open PDFs with the native file picker and drag-and-drop
- Security-scoped bookmarks for recent documents
- PDFKit rendering, thumbnails, page navigation, zoom, fit, and actual size
- Highlight selected text and add free-text notes
- Rotate pages, save, Save As, and print
- Native macOS menus, keyboard shortcuts, toolbar, and unsaved-change prompts
- Sandboxed and hardened-runtime project configuration
- Unit-test target

## Build and run

Requirements: Xcode and [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```sh
cd native/macos
xcodegen generate
open FolioNative.xcodeproj
```

For a non-interactive verification build:

```sh
xcodebuild \
  -project FolioNative.xcodeproj \
  -scheme FolioNative \
  -configuration Debug \
  -destination 'platform=macOS' \
  -derivedDataPath .derived-data \
  CODE_SIGNING_ALLOWED=NO \
  build test
```

The generated Xcode project is committed for convenient opening. Run `xcodegen generate` after changing `project.yml`.

## Migration plan

The Electron app remains the production, cross-platform application until native feature parity is reached.

1. **PDF foundation:** document lifecycle, rendering, navigation, recents, annotations, saving, and printing.
2. **Signing:** reusable signatures, drawn placeholder boxes, aspect-fit placement, and optional placement and automatic filling on every page.
3. **Reader workflows:** bookmarks, richer shapes, tabs, annotation persistence, note export, and document reordering.
4. **Accessibility and recognition:** Vision-based OCR, searchable scanned documents, dark reading modes, and VoiceOver review.
5. **Editing:** text and image editing, undo history, document versions, and safe recovery.
6. **Connected features:** AI providers, upstream update comparison, privacy controls, diagnostics, signing, notarization, and native distribution.

Each phase should add XCTest coverage and representative PDF fixtures before the native app replaces any production workflow.

## Architecture

- `FolioNativeApp.swift`: application entry point and native command menus
- `ContentView.swift`: welcome screen and primary reader layout
- `PDFDocumentStore.swift`: document lifecycle and user actions
- `PDFKitView.swift`: SwiftUI bridge around `PDFView`
- `ThumbnailSidebar.swift`: PDFKit thumbnail navigation
- `project.yml`: reproducible XcodeGen project definition
