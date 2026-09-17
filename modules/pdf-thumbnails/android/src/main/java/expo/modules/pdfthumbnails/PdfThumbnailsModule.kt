package expo.modules.pdfthumbnails

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.PDResources
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.security.MessageDigest
import org.json.JSONObject
import java.util.zip.Deflater
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

private const val EMU_PER_PT = 12700L
private const val DOCX_MAX_W = 6120130L // A4 minus 2 cm margins, in EMU
private const val DOCX_MAX_H = 8900000L // a little under the usable height, so a picture never spills onto a blank page

private fun xml(s: String) = buildString {
  for (ch in s) when (ch) {
    '&' -> append("&amp;")
    '<' -> append("&lt;")
    '>' -> append("&gt;")
    '"' -> append("&quot;")
    else -> if (ch == '\t' || (ch >= ' ' && ch != '￾' && ch != '￿')) append(ch) // other control chars are invalid XML
  }
}

// Cheap pre-check so ordinary PDFs never pay for a full PdfBox parse: encryption is declared in the trailer, which sits
// in the last bytes (or near the start of linearized files).
// ponytail: only the first 16 KB and last 64 KB are searched; a PDF declaring it elsewhere reaches the tool still
// encrypted, and pdf-lib reports it as password-protected.
private fun mentionsEncrypt(f: File): Boolean = RandomAccessFile(f, "r").use { raf ->
  val len = raf.length()
  val read = { from: Long, size: Long ->
    val bytes = ByteArray(minOf(size, len - from).toInt())
    raf.seek(from)
    raf.readFully(bytes)
    String(bytes, Charsets.ISO_8859_1)
  }
  "/Encrypt" in read(0, 16384) || "/Encrypt" in read(maxOf(0, len - 65536), 65536)
}

// Renders one page to a white-backed JPEG `width` pixels wide.
private fun PdfRenderer.Page.writeJpeg(width: Int, quality: Int, sink: OutputStream) {
  val height = (this.height * width.toFloat() / this.width).toInt().coerceAtLeast(1)
  val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888) // the only format PdfRenderer accepts
  bitmap.eraseColor(Color.WHITE) // PDFs assume white paper; the bitmap starts transparent
  render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
  bitmap.compress(Bitmap.CompressFormat.JPEG, quality, sink)
  bitmap.recycle()
}

// PDF work that is too slow for the JS thread or beyond pdf-lib: thumbnails, page sizes, JPEG re-encoding (Android's
// PdfRenderer and Bitmap), plus passwords and Word export (PdfBox). Async functions run on a background thread.
class PdfThumbnailsModule : Module() {
  private fun open(uri: String): ParcelFileDescriptor {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val parsed = Uri.parse(uri)
    return if (parsed.scheme == "content") {
      context.contentResolver.openFileDescriptor(parsed, "r")
    } else {
      ParcelFileDescriptor.open(File(parsed.path ?: uri), ParcelFileDescriptor.MODE_READ_ONLY)
    } ?: throw IllegalArgumentException("Could not open $uri")
  }

  override fun definition() = ModuleDefinition {
    Name("PdfThumbnails")

    OnCreate {
      appContext.reactContext?.let { PDFBoxResourceLoader.init(it.applicationContext) } // PdfBox's fonts and glyph lists
    }

    // A copy the tools can read: the same uri when the PDF isn't encrypted, a decrypted copy in the cache when `password`
    // opens it (empty works for PDFs locked only against editing), or null when it needs a (different) password.
    AsyncFunction("unlock") { uri: String, password: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val file = File(Uri.parse(uri).path ?: uri)
      if (!mentionsEncrypt(file)) return@AsyncFunction uri
      try {
        PDDocument.load(file, password).use { doc ->
          if (!doc.isEncrypted) return@AsyncFunction uri
          doc.isAllSecurityToBeRemoved = true
          val out = File(File(context.cacheDir, "unlocked").apply { mkdirs() }, "${System.currentTimeMillis()}.pdf")
          doc.save(out)
          Uri.fromFile(out).toString()
        }
      } catch (_: InvalidPasswordException) {
        null
      }
    }

    // One page as a JPEG `maxWidth` px wide, cached per file, page and width (the redact editor shows a page at a time).
    AsyncFunction("renderPage") { uri: String, index: Int, maxWidth: Int ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val src = File(Uri.parse(uri).path ?: uri)
      val key = MessageDigest.getInstance("MD5").digest("$uri-${src.lastModified()}-${src.length()}-$index-$maxWidth".toByteArray())
        .joinToString("") { "%02x".format(it) }
      val out = File(File(context.cacheDir, "pdf-pages").apply { mkdirs() }, "$key.jpg")
      var size = 0 to 0
      if (!out.exists()) {
        val part = File(out.path + ".part") // only a finished render takes the cached name
        PdfRenderer(open(uri)).use { r -> r.openPage(index).use { p -> BufferedOutputStream(FileOutputStream(part)).use { p.writeJpeg(maxWidth, 85, it) } } }
        part.renameTo(out)
      }
      BitmapFactory.Options().apply { inJustDecodeBounds = true }.also { BitmapFactory.decodeFile(out.path, it); size = it.outWidth to it.outHeight }
      mapOf("uri" to Uri.fromFile(out).toString(), "width" to size.first, "height" to size.second)
    }

    // Redaction that removes, not covers. Every page with boxes is rendered at 216 dpi with the boxes painted black, and
    // that picture becomes the page's only content: the text, images and vectors under a box no longer exist, and the rest
    // of that page stays visible but is no longer selectable text. `boxesJson` maps a page index to [x, y, w, h] boxes as
    // fractions of the page as displayed. Also dropped, since they can hold copies of redacted text: those pages'
    // annotations, the form field tree, and the accessibility tag tree.
    AsyncFunction("redact") { bytes: ByteArray, boxesJson: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val boxes = JSONObject(boxesJson)
      val tmp = File(context.cacheDir, "redact-${System.currentTimeMillis()}.pdf").apply { writeBytes(bytes) } // PdfRenderer needs a file
      try {
        PDDocument.load(tmp).use { doc ->
          val redacted = mutableSetOf<Int>()
          PdfRenderer(ParcelFileDescriptor.open(tmp, ParcelFileDescriptor.MODE_READ_ONLY)).use { renderer ->
            for (key in boxes.keys()) {
              val i = key.toInt()
              val list = boxes.getJSONArray(key)
              if (list.length() == 0 || i !in 0 until renderer.pageCount) continue
              val (w, h, image) = renderer.openPage(i).use { p ->
                val bw = minOf(p.width * 3, 3000)
                val bh = (p.height * bw.toFloat() / p.width).toInt().coerceAtLeast(1)
                val bitmap = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)
                p.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                val canvas = Canvas(bitmap)
                val black = Paint().apply { color = Color.BLACK; style = Paint.Style.FILL }
                for (j in 0 until list.length()) {
                  val b = list.getJSONArray(j)
                  val x = (b.getDouble(0) * bw).toFloat()
                  val y = (b.getDouble(1) * bh).toFloat()
                  canvas.drawRect(x, y, x + (b.getDouble(2) * bw).toFloat(), y + (b.getDouble(3) * bh).toFloat(), black)
                }
                bitmap.setHasAlpha(false) // no soft mask in the PDF
                val img = JPEGFactory.createFromImage(doc, bitmap, 0.9f)
                bitmap.recycle()
                Triple(p.width.toFloat(), p.height.toFloat(), img)
              }
              val page = doc.getPage(i)
              for (name in listOf("Annots", "Thumb", "PieceInfo", "Metadata", "StructParents", "B", "AA", "Tabs", "ArtBox", "BleedBox", "TrimBox", "UserUnit", "Group", "VP", "SeparationInfo", "ID", "PZ")) {
                page.cosObject.removeItem(COSName.getPDFName(name))
              }
              val box = PDRectangle(w, h) // the picture is already the visible area, rotated as displayed
              page.mediaBox = box
              page.cropBox = box
              page.rotation = 0
              page.resources = PDResources()
              PDPageContentStream(doc, page, PDPageContentStream.AppendMode.OVERWRITE, true).use { it.drawImage(image, 0f, 0f, w, h) }
              redacted += i
            }
          }
          if (redacted.isNotEmpty()) {
            val catalog = doc.documentCatalog.cosObject
            listOf("AcroForm", "StructTreeRoot", "MarkInfo").forEach { catalog.removeItem(COSName.getPDFName(it)) }
            // Annotations elsewhere can still point at the removed ones (a popup's /Parent, a reply's /IRT, a form widget's
            // field parent listing its sibling widgets), which would keep them, and their text, in the saved file.
            for ((i, page) in doc.pages.withIndex()) {
              if (i in redacted) continue
              for (annot in page.annotations) {
                annot.cosObject.removeItem(COSName.getPDFName("Parent"))
                annot.cosObject.removeItem(COSName.getPDFName("IRT"))
              }
            }
          }
          ByteArrayOutputStream(bytes.size).use { out -> doc.save(out); out.toByteArray() } // a full rewrite: unreferenced objects aren't written
        }
      } finally {
        tmp.delete()
      }
    }

    // Sets a file's last-modified time (ms), so a PDF downloaded from Drive keeps its real date. False if the OS refused.
    Function("setModified") { uri: String, ms: Double ->
      File(Uri.parse(uri).path ?: uri).setLastModified(ms.toLong())
    }

    // Encrypts with AES-256; the password both opens the PDF and unlocks every permission.
    // Null when the PDF is already encrypted, so it isn't re-locked over someone else's settings.
    AsyncFunction("setPassword") { bytes: ByteArray, password: String ->
      val doc = try { PDDocument.load(bytes) } catch (_: InvalidPasswordException) { return@AsyncFunction null }
      doc.use {
        if (it.isEncrypted) return@AsyncFunction null
        it.protect(StandardProtectionPolicy(password, password, AccessPermission()).apply { encryptionKeyLength = 256 })
        ByteArrayOutputStream(bytes.size).use { out -> it.save(out); out.toByteArray() }
      }
    }

    // Every page as a JPEG at 144 dpi (at most 2400 px wide), written to the cache: a .jpg for one page, a .zip for more.
    AsyncFunction("toJpeg") { uri: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      PdfRenderer(open(uri)).use { renderer ->
        val n = renderer.pageCount
        val out = File(context.cacheDir, "export-${System.currentTimeMillis()}.${if (n == 1) "jpg" else "zip"}")
        val page = { i: Int, sink: OutputStream -> renderer.openPage(i).use { it.writeJpeg(minOf(it.width * 2, 2400), 90, sink) } }
        val sink = BufferedOutputStream(FileOutputStream(out))
        if (n == 1) {
          sink.use { page(0, it) }
        } else {
          ZipOutputStream(sink).use { zip ->
            zip.setLevel(Deflater.NO_COMPRESSION) // JPEGs don't shrink any further
            for (i in 0 until n) {
              zip.putNextEntry(ZipEntry("page-%03d.jpg".format(i + 1)))
              page(i, zip)
              zip.closeEntry()
            }
          }
        }
        Uri.fromFile(out).toString()
      }
    }

    // A .docx in the cache: each page's text as paragraphs, starting on a new page. Pages with (almost) no text, such as
    // scans and photos, go in as a picture of the page instead.
    // ponytail: text only on text pages, so their images, tables and columns are lost; OCR for scans would need ML Kit.
    AsyncFunction("toDocx") { uri: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val out = File(context.cacheDir, "export-${System.currentTimeMillis()}.docx")
      PDDocument.load(File(Uri.parse(uri).path ?: uri)).use { doc ->
        PdfRenderer(open(uri)).use { renderer ->
          ZipOutputStream(BufferedOutputStream(FileOutputStream(out))).use { zip ->
            val put = { name: String, body: String ->
              zip.putNextEntry(ZipEntry(name))
              zip.write(body.toByteArray())
              zip.closeEntry()
            }
            val stripper = PDFTextStripper().apply { sortByPosition = true; lineSeparator = " "; paragraphEnd = "\n" }
            val body = StringBuilder()
            val rels = StringBuilder()
            for (i in 0 until doc.numberOfPages) {
              val newPage = if (i > 0) "<w:pPr><w:pageBreakBefore/></w:pPr>" else ""
              stripper.startPage = i + 1
              stripper.endPage = i + 1
              val paras = stripper.getText(doc).split('\n').map { it.trim() }.filter { it.isNotEmpty() }
              if (paras.sumOf { it.length } >= 50) {
                paras.forEachIndexed { k, t ->
                  body.append("<w:p>${if (k == 0) newPage else ""}<w:r><w:t xml:space=\"preserve\">${xml(t)}</w:t></w:r></w:p>")
                }
                continue
              }
              val id = "page${i + 1}"
              zip.putNextEntry(ZipEntry("word/media/$id.jpeg"))
              val (w, h) = renderer.openPage(i).use { it.writeJpeg(minOf(it.width * 2, 1600), 85, zip); it.width to it.height }
              zip.closeEntry()
              val k = minOf(DOCX_MAX_W.toDouble() / (w * EMU_PER_PT), DOCX_MAX_H.toDouble() / (h * EMU_PER_PT))
              val cx = (w * EMU_PER_PT * k).toLong()
              val cy = (h * EMU_PER_PT * k).toLong()
              rels.append("<Relationship Id=\"$id\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/$id.jpeg\"/>")
              body.append(
                "<w:p>$newPage<w:r><w:drawing><wp:inline><wp:extent cx=\"$cx\" cy=\"$cy\"/><wp:docPr id=\"${i + 1}\" name=\"Page ${i + 1}\"/>" +
                  "<a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:pic>" +
                  "<pic:nvPicPr><pic:cNvPr id=\"${i + 1}\" name=\"$id.jpeg\"/><pic:cNvPicPr/></pic:nvPicPr>" +
                  "<pic:blipFill><a:blip r:embed=\"$id\"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>" +
                  "<pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"$cx\" cy=\"$cy\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr>" +
                  "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"
              )
            }
            val head = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
            put(
              "[Content_Types].xml",
              "$head<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
                "<Default Extension=\"xml\" ContentType=\"application/xml\"/><Default Extension=\"jpeg\" ContentType=\"image/jpeg\"/>" +
                "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>"
            )
            put(
              "_rels/.rels",
              "$head<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>"
            )
            put("word/_rels/document.xml.rels", "$head<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">$rels</Relationships>")
            put(
              "word/document.xml",
              "$head<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" " +
                "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" " +
                "xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\" " +
                "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" " +
                "xmlns:pic=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><w:body>$body" +
                "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1134\" w:right=\"1134\" w:bottom=\"1134\" w:left=\"1134\" " +
                "w:header=\"0\" w:footer=\"0\" w:gutter=\"0\"/></w:sectPr></w:body></w:document>"
            )
          }
        }
      }
      Uri.fromFile(out).toString()
    }

    // Page sizes in points as displayed (the page's /Rotate already applied), without rendering anything.
    AsyncFunction("pageSizes") { uri: String ->
      PdfRenderer(open(uri)).use { renderer ->
        (0 until renderer.pageCount).map { i ->
          renderer.openPage(i).use { mapOf("width" to it.width, "height" to it.height) }
        }
      }
    }

    // Re-encodes one JPEG at `quality` (0-100). Null when Android can't decode it (CMYK and other rare flavours).
    AsyncFunction("recompressJpeg") { bytes: ByteArray, quality: Int ->
      val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return@AsyncFunction null
      try {
        ByteArrayOutputStream(bytes.size / 2).use { out ->
          bitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(1, 100), out)
          out.toByteArray()
        }
      } finally {
        bitmap.recycle()
      }
    }

    // maxPages 0 renders every page.
    AsyncFunction("render") { uri: String, maxWidth: Int, maxPages: Int ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val parsed = Uri.parse(uri)
      val fileObj = if (parsed.scheme != "content") File(parsed.path ?: uri) else null
      val lastModified = fileObj?.lastModified() ?: 0L
      val fileSize = fileObj?.length() ?: 0L

      // Generate a stable cache key for this specific file, size, resolution and page limit
      val keyInput = "$uri-$lastModified-$fileSize-$maxWidth-$maxPages"
      val md5 = MessageDigest.getInstance("MD5").digest(keyInput.toByteArray())
        .joinToString("") { "%02x".format(it) }

      val root = File(context.cacheDir, "pdf-thumbnails").apply { if (!exists()) mkdirs() }
      val dir = File(root, md5)
      val metaFile = File(dir, "meta.txt")

      // Return cached pages instantly if already rendered
      if (dir.exists() && metaFile.exists()) {
        val count = metaFile.readText().trim().toIntOrNull() ?: 0
        if (count > 0) {
          val cached = (0 until count).mapNotNull { i ->
            val f = File(dir, "$i.jpg")
            if (f.exists()) {
              val dims = File(dir, "$i.dim").takeIf { it.exists() }?.readText()?.split("x")
              val w = dims?.getOrNull(0)?.toIntOrNull() ?: maxWidth
              val h = dims?.getOrNull(1)?.toIntOrNull() ?: (maxWidth * 1.414).toInt()
              mapOf("uri" to Uri.fromFile(f).toString(), "width" to w, "height" to h)
            } else null
          }
          if (cached.size == count) {
            return@AsyncFunction cached
          }
        }
      }

      val fd = open(uri)

      // Clean older cache folders if cache grows too large (> 8 documents)
      try {
        val dirs = root.listFiles()?.filter { it.isDirectory } ?: emptyList()
        if (dirs.size > 8) {
          dirs.sortedBy { it.lastModified() }.take(dirs.size - 6).forEach { it.deleteRecursively() }
        }
      } catch (_: Exception) {}

      dir.deleteRecursively()
      dir.mkdirs()

      PdfRenderer(fd).use { renderer ->
        val count = if (maxPages > 0) minOf(maxPages, renderer.pageCount) else renderer.pageCount
        val results = (0 until count).map { i ->
          renderer.openPage(i).use { page ->
            val height = (page.height * maxWidth.toFloat() / page.width).toInt().coerceAtLeast(1)
            // PdfRenderer only accepts ARGB_8888; anything else throws "Unsupported pixel format"
            val bitmap = Bitmap.createBitmap(maxWidth, height, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE) // PDFs assume white paper; the bitmap starts transparent
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val file = File(dir, "$i.jpg")
            BufferedOutputStream(FileOutputStream(file)).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 75, it) }
            bitmap.recycle()
            File(dir, "$i.dim").writeText("${maxWidth}x$height")
            mapOf("uri" to Uri.fromFile(file).toString(), "width" to maxWidth, "height" to height)
          }
        }
        metaFile.writeText(count.toString())
        results
      }
    }
  }
}
