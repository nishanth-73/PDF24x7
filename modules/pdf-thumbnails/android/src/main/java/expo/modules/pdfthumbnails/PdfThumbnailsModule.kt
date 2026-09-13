package expo.modules.pdfthumbnails

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

// Renders every page of a PDF to a small JPEG with Android's built-in PdfRenderer.
class PdfThumbnailsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PdfThumbnails")

    AsyncFunction("render") { uri: String, maxWidth: Int ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val parsed = Uri.parse(uri)
      val fileObj = if (parsed.scheme != "content") File(parsed.path ?: uri) else null
      val lastModified = fileObj?.lastModified() ?: 0L
      val fileSize = fileObj?.length() ?: 0L

      // Generate a stable cache key for this specific file, size, and resolution
      val keyInput = "$uri-$lastModified-$fileSize-$maxWidth"
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

      val fd = if (parsed.scheme == "content") {
        context.contentResolver.openFileDescriptor(parsed, "r")
      } else {
        ParcelFileDescriptor.open(fileObj ?: File(parsed.path ?: uri), ParcelFileDescriptor.MODE_READ_ONLY)
      } ?: throw IllegalArgumentException("Could not open $uri")

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
        val results = (0 until renderer.pageCount).map { i ->
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
        metaFile.writeText(renderer.pageCount.toString())
        results
      }
    }
  }
}
