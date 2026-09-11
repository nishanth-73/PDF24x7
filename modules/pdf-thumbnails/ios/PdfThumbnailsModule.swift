import ExpoModulesCore
import PDFKit

// Renders every page of a PDF to a small JPEG with PDFKit.
public final class PdfThumbnailsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PdfThumbnails")

    AsyncFunction("render") { (uri: URL, maxWidth: Int) -> [[String: Any]] in
      guard let doc = PDFDocument(url: uri) else {
        throw Exception(name: "PdfOpenFailed", description: "Could not open \(uri.lastPathComponent)")
      }
      // A fresh folder per call, so the image cache never shows pages from a previous PDF.
      let root = FileManager.default.temporaryDirectory.appendingPathComponent("pdf-thumbnails")
      try? FileManager.default.removeItem(at: root)
      let dir = root.appendingPathComponent(UUID().uuidString)
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

      return try (0..<doc.pageCount).compactMap { i -> [String: Any]? in
        guard let page = doc.page(at: i) else { return nil }
        let bounds = page.bounds(for: .mediaBox)
        let width = CGFloat(maxWidth)
        let size = CGSize(width: width, height: max(1, width * bounds.height / bounds.width))
        let image = page.thumbnail(of: size, for: .mediaBox)
        let file = dir.appendingPathComponent("\(i).jpg")
        try image.jpegData(compressionQuality: 0.8)?.write(to: file)
        return ["uri": file.absoluteString, "width": Int(image.size.width), "height": Int(image.size.height)]
      }
    }
  }
}
