package expo.modules.pdfthumbnails

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

// Renders every page of a PDF to a small JPEG with Android's built-in PdfRenderer.
class PdfThumbnailsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PdfThumbnails")

    AsyncFunction("render") { uri: String, maxWidth: Int ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val parsed = Uri.parse(uri)
      val fd = if (parsed.scheme == "content") {
        context.contentResolver.openFileDescriptor(parsed, "r")
      } else {
        ParcelFileDescriptor.open(File(parsed.path ?: uri), ParcelFileDescriptor.MODE_READ_ONLY)
      } ?: throw IllegalArgumentException("Could not open $uri")

      // A fresh folder per call, so the image cache never shows pages from a previous PDF.
      val root = File(context.cacheDir, "pdf-thumbnails").apply { deleteRecursively() }
      val dir = File(root, System.currentTimeMillis().toString()).apply { mkdirs() }

      PdfRenderer(fd).use { renderer ->
        (0 until renderer.pageCount).map { i ->
          renderer.openPage(i).use { page ->
            val height = (page.height * maxWidth.toFloat() / page.width).toInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(maxWidth, height, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE) // PDFs assume white paper; the bitmap starts transparent
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val file = File(dir, "$i.jpg")
            FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 80, it) }
            bitmap.recycle()
            mapOf("uri" to Uri.fromFile(file).toString(), "width" to maxWidth, "height" to height)
          }
        }
      }
    }
  }
}
