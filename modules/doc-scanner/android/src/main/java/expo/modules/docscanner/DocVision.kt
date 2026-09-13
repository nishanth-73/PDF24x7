package expo.modules.docscanner

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfInt
import org.opencv.core.MatOfPoint
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.core.Scalar
import org.opencv.core.Size
import org.opencv.imgcodecs.Imgcodecs
import org.opencv.imgproc.Imgproc
import java.io.File
import java.util.UUID
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt

// Everything image-side: find a page in a picture, straighten it, and apply Adobe-style filters, adjustments and strokes.
// Corners are always [x0,y0, x1,y1, x2,y2, x3,y3] as fractions of the upright image (top-left, top-right, bottom-right, bottom-left).
object DocVision {
  // Loads libopencv_java4. Anything that builds a Mat outside this object must call ready() first.
  private val loaded = OpenCVLoader.initLocal()

  fun ready(): Boolean = loaded

  // ── Detection ──────────────────────────────────────────────────────────────

  // Finds the page in a (possibly huge) photo; detection itself runs at ~360 px.
  fun detectBitmap(bmp: Bitmap): DoubleArray? {
    val scale = 720.0 / max(bmp.width, bmp.height)
    val small = if (scale < 1) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).roundToInt(), (bmp.height * scale).roundToInt(), true) else bmp
    val rgba = Mat()
    Utils.bitmapToMat(small, rgba)
    Imgproc.cvtColor(rgba, rgba, Imgproc.COLOR_RGBA2RGB)
    return PageDetector.detect(rgba).also { rgba.release(); if (small !== bmp) small.recycle() }
  }

  // ── Loading & saving ───────────────────────────────────────────────────────

  // Decodes upright (EXIF applied), downsampled so the long side stays near maxSize.
  fun load(context: Context, uri: String, maxSize: Int): Bitmap {
    val u = Uri.parse(uri)
    val open = { context.contentResolver.openInputStream(u) ?: throw IllegalArgumentException("Cannot open $uri") }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open().use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSize) sample *= 2
    val bmp = open().use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
      ?: throw IllegalArgumentException("Not an image: $uri")
    val degrees = open().use {
      when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> 0f
      }
    }
    return rotate(bmp, degrees)
  }

  fun rotate(bmp: Bitmap, degrees: Float): Bitmap {
    if (degrees == 0f) return bmp
    val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(degrees) }, true)
    if (out !== bmp) bmp.recycle()
    return out
  }

  fun newFile(dir: File): File = File(dir.apply { mkdirs() }, "${UUID.randomUUID()}.jpg")

  private fun save(rgb: Mat, file: File) {
    val bgr = Mat()
    Imgproc.cvtColor(rgb, bgr, Imgproc.COLOR_RGB2BGR)
    Imgcodecs.imwrite(file.absolutePath, bgr, MatOfInt(Imgcodecs.IMWRITE_JPEG_QUALITY, 90))
    bgr.release()
  }

  // ── Processing ─────────────────────────────────────────────────────────────

  fun process(context: Context, uri: String, o: ProcessOptions): Map<String, Any> {
    val bmp = load(context, uri, o.maxSize)
    val rgba = Mat()
    Utils.bitmapToMat(bmp, rgba)
    bmp.recycle()
    var img = Mat()
    Imgproc.cvtColor(rgba, img, Imgproc.COLOR_RGBA2RGB)
    rgba.release()

    o.corners?.takeIf { it.size == 8 }?.let { c -> img = warp(img, c) }
    when (((o.rotation % 360) + 360) % 360) {
      90 -> Core.rotate(img, img, Core.ROTATE_90_CLOCKWISE)
      180 -> Core.rotate(img, img, Core.ROTATE_180)
      270 -> Core.rotate(img, img, Core.ROTATE_90_COUNTERCLOCKWISE)
    }
    filter(img, o.filter)
    if (o.brightness != 0.0 || o.contrast != 0.0) {
      val alpha = 1 + o.contrast * 0.8 // contrast -1..1 -> 0.2x..1.8x around mid-gray
      img.convertTo(img, -1, alpha, 128 * (1 - alpha) + o.brightness * 90)
    }
    val bg = Core.mean(img) // paper color for cleanup's "Auto" fill, taken before strokes
    for (s in o.strokes) draw(img, s)

    val file = o.dest?.let { File(Uri.parse(it).path ?: it) } ?: newFile(File(context.cacheDir, "doc-scans"))
    file.parentFile?.mkdirs()
    save(img, file)
    val result = mapOf(
      "uri" to Uri.fromFile(file).toString(), "width" to img.cols(), "height" to img.rows(),
      "bg" to "#%02x%02x%02x".format(bg.`val`[0].roundToInt(), bg.`val`[1].roundToInt(), bg.`val`[2].roundToInt()),
    )
    img.release()
    return result
  }

  private fun warp(src: Mat, c: DoubleArray): Mat {
    val w = src.cols().toDouble()
    val h = src.rows().toDouble()
    // Re-sort in image space so a crop dragged "inside out" still comes out upright.
    val p = PageDetector.order(Array(4) { Point(c[it * 2].coerceIn(0.0, 1.0) * w, c[it * 2 + 1].coerceIn(0.0, 1.0) * h) })
    val dist = { a: Point, b: Point -> hypot(a.x - b.x, a.y - b.y) }
    val outW = max(dist(p[0], p[1]), dist(p[3], p[2])).coerceAtLeast(16.0)
    val outH = max(dist(p[0], p[3]), dist(p[1], p[2])).coerceAtLeast(16.0)
    val m = Imgproc.getPerspectiveTransform(
      MatOfPoint2f(*p),
      MatOfPoint2f(Point(0.0, 0.0), Point(outW, 0.0), Point(outW, outH), Point(0.0, outH)),
    )
    val out = Mat()
    Imgproc.warpPerspective(src, out, m, Size(outW, outH), Imgproc.INTER_LINEAR, Core.BORDER_REPLICATE)
    src.release()
    m.release()
    return out
  }

  // Divides each channel by a blurred estimate of the paper, so shadows and uneven light go flat white.
  private fun flatten(img: Mat) {
    val channels = ArrayList<Mat>()
    Core.split(img, channels)
    val kernel = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(5.0, 5.0))
    for (ch in channels) {
      val bg = Mat()
      Imgproc.resize(ch, bg, Size(), 0.125, 0.125, Imgproc.INTER_AREA)
      Imgproc.dilate(bg, bg, kernel) // erase text strokes from the estimate
      Imgproc.medianBlur(bg, bg, 9)
      Imgproc.resize(bg, bg, ch.size(), 0.0, 0.0, Imgproc.INTER_LINEAR)
      Core.divide(ch, bg, ch, 255.0)
      bg.release()
    }
    Core.merge(channels, img)
    channels.forEach { it.release() }
    kernel.release()
  }

  private fun saturate(img: Mat, factor: Double) {
    Imgproc.cvtColor(img, img, Imgproc.COLOR_RGB2HSV)
    val ch = ArrayList<Mat>()
    Core.split(img, ch)
    ch[1].convertTo(ch[1], -1, factor, 0.0)
    Core.merge(ch, img)
    ch.forEach { it.release() }
    Imgproc.cvtColor(img, img, Imgproc.COLOR_HSV2RGB)
  }

  private fun toGray(img: Mat) {
    Imgproc.cvtColor(img, img, Imgproc.COLOR_RGB2GRAY)
    Imgproc.cvtColor(img, img, Imgproc.COLOR_GRAY2RGB)
  }

  // Adobe Scan's filters: Original color, Auto-color, Light text, Grayscale, Whiteboard.
  private fun filter(img: Mat, name: String) {
    when (name) {
      "auto" -> { flatten(img); img.convertTo(img, -1, 1.12, -14.0); saturate(img, 1.2) }
      "light" -> { flatten(img); toGray(img); Core.LUT(img, lightTextCurve, img) }
      "gray" -> { toGray(img); Core.normalize(img, img, 0.0, 255.0, Core.NORM_MINMAX) }
      "whiteboard" -> { flatten(img); img.convertTo(img, -1, 1.35, -60.0); saturate(img, 1.6) }
    }
  }

  private fun draw(img: Mat, s: StrokeRecord) {
    if (s.points.size < 2) return
    val w = img.cols()
    val h = img.rows()
    val color = s.color.removePrefix("#").toLong(16).let { Scalar(((it shr 16) and 255).toDouble(), ((it shr 8) and 255).toDouble(), (it and 255).toDouble()) }
    val pts = s.points.chunked(2).filter { it.size == 2 }.map { Point(it[0] * w, it[1] * h) }
    val thickness = (s.width * w).roundToInt().coerceAtLeast(1)
    when (s.shape) {
      "rect", "fill" -> Imgproc.rectangle(img, pts.first(), pts.last(), color, if (s.shape == "fill") Imgproc.FILLED else thickness, Imgproc.LINE_AA)
      "ellipse" -> {
        val a = pts.first(); val b = pts.last()
        Imgproc.ellipse(img, Point((a.x + b.x) / 2, (a.y + b.y) / 2), Size(kotlin.math.abs(b.x - a.x) / 2, kotlin.math.abs(b.y - a.y) / 2), 0.0, 0.0, 360.0, color, thickness, Imgproc.LINE_AA)
      }
      else -> {
        if (pts.size == 1) Imgproc.circle(img, pts[0], thickness / 2, color, Imgproc.FILLED, Imgproc.LINE_AA)
        else Imgproc.polylines(img, listOf(MatOfPoint(*pts.toTypedArray())), false, color, thickness, Imgproc.LINE_AA)
      }
    }
  }

  // Near-white goes pure white; everything darker is pushed down hard, so faint pencil and print become bold.
  private val lightTextCurve: Mat by lazy {
    Mat(1, 256, CvType.CV_8U).apply {
      put(0, 0, ByteArray(256) { i -> (if (i >= 232) 255.0 else 255.0 * Math.pow(i / 232.0, 2.6)).roundToInt().toByte() })
    }
  }
}
