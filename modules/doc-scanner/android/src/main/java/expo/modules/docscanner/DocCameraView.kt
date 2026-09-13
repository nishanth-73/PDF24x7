package expo.modules.docscanner

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.lifecycle.awaitInstance
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.google.zxing.BinaryBitmap
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.opencv.core.Core
import org.opencv.android.Utils
import org.opencv.core.Mat
import org.opencv.imgproc.Imgproc
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import kotlinx.coroutines.launch

// Live 3:4 camera: preview, page-edge detection on the analysis stream, QR reading, and full-resolution capture.
@SuppressLint("ViewConstructor")
class DocCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onDetect by EventDispatcher()
  private val onQr by EventDispatcher()

  var flash = "off"
    set(value) {
      field = value
      capture?.flashMode = flashMode()
    }
  var detecting = true
  var qr = false

  private val preview = PreviewView(context).apply {
    scaleType = PreviewView.ScaleType.FIT_CENTER
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE // TextureView: composites correctly under RN overlays
  }
  private val worker = Executors.newSingleThreadExecutor()
  private var provider: ProcessCameraProvider? = null
  private var capture: ImageCapture? = null
  private var frame = 0
  private var lastQr = ""

  init {
    DocModel.source = { context.assets.open(DocModel.ASSET).use { it.readBytes() } } // loaded lazily on the analysis thread
    addView(preview, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    // CameraX adds its TextureView inside PreviewView after binding; lay it out then, or it stays 0x0 and the preview is black.
    preview.setOnHierarchyChangeListener(object : OnHierarchyChangeListener {
      override fun onChildViewAdded(parent: View?, child: View?) = layoutPreview()
      override fun onChildViewRemoved(parent: View?, child: View?) = Unit
    })
  }

  // React Native ignores native requestLayout() calls, so measure and lay out the preview ourselves.
  private fun layoutPreview() {
    if (width == 0 || height == 0) return
    preview.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
    preview.layout(0, 0, width, height)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = layoutPreview()

  override fun requestLayout() {
    super.requestLayout()
    post { layoutPreview() }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    appContext.mainQueue.launch { bind(ProcessCameraProvider.awaitInstance(context)) }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    release()
  }

  fun release() {
    provider?.unbindAll()
    provider = null
    capture = null
  }

  // Final teardown when React Native drops the view (a detach alone may be followed by a re-attach).
  fun destroy() {
    release()
    worker.shutdown()
  }

  private fun flashMode() = when (flash) {
    "on" -> ImageCapture.FLASH_MODE_ON
    "auto" -> ImageCapture.FLASH_MODE_AUTO
    else -> ImageCapture.FLASH_MODE_OFF
  }

  private fun bind(p: ProcessCameraProvider) {
    val owner = appContext.currentActivity as? LifecycleOwner ?: return
    if (!isAttachedToWindow) return
    val ratio = ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).build()
    val previewCase = Preview.Builder().setResolutionSelector(ratio).build().also { it.surfaceProvider = preview.surfaceProvider }
    val captureCase = ImageCapture.Builder()
      .setResolutionSelector(ratio)
      .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
      .setFlashMode(flashMode())
      .build()
    val analysisCase = ImageAnalysis.Builder()
      .setResolutionSelector(ratio)
      .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
      .build()
      .also { it.setAnalyzer(worker, ::analyze) }
    val group = UseCaseGroup.Builder().addUseCase(previewCase).addUseCase(captureCase).addUseCase(analysisCase).build()
    p.unbindAll()
    p.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, group)
    provider = p
    capture = captureCase
  }

  private fun analyze(image: ImageProxy) {
    image.use {
      frame++
      if (qr && frame % 4 == 0) {
        val plane = it.planes[0]
        val w = it.width
        val h = it.height
        val bytes = ByteArray(w * h)
        val buf = plane.buffer
        for (row in 0 until h) { // copy luminance row by row; rowStride can exceed width
          buf.position(row * plane.rowStride)
          buf.get(bytes, row * w, w)
        }
        val text = try {
          QRCodeReader().decode(BinaryBitmap(HybridBinarizer(PlanarYUVLuminanceSource(bytes, w, h, 0, 0, w, h, false)))).text
        } catch (_: Exception) {
          null
        }
        if (text != null && text != lastQr) {
          lastQr = text
          post { onQr(mapOf("data" to text)) }
        }
      }

      if (!detecting || frame % 2 != 0 || !DocVision.ready()) return
      // Color, not just luminance: many page/table edges are a color change more than a brightness change.
      val bmp = it.toBitmap()
      val rgb = Mat()
      Utils.bitmapToMat(bmp, rgb)
      bmp.recycle()
      Imgproc.cvtColor(rgb, rgb, Imgproc.COLOR_RGBA2RGB)
      when (it.imageInfo.rotationDegrees) { // analysis frames arrive sensor-rotated; detect on the upright view
        90 -> Core.rotate(rgb, rgb, Core.ROTATE_90_CLOCKWISE)
        180 -> Core.rotate(rgb, rgb, Core.ROTATE_180)
        270 -> Core.rotate(rgb, rgb, Core.ROTATE_90_COUNTERCLOCKWISE)
      }
      val corners = PageDetector.detect(rgb)
      rgb.release()
      post { onDetect(mapOf("corners" to (corners?.toList() ?: emptyList()))) }
    }
  }

  fun takePicture(promise: Promise) {
    val c = capture ?: return promise.reject("ERR_CAMERA_NOT_READY", "Camera is not ready yet.", null)
    c.takePicture(worker, object : ImageCapture.OnImageCapturedCallback() {
      override fun onCaptureSuccess(image: ImageProxy) {
        try {
          val degrees = image.imageInfo.rotationDegrees.toFloat()
          val bmp = DocVision.rotate(image.toBitmap(), degrees)
          image.close()
          val file = DocVision.newFile(File(context.cacheDir, "doc-scans"))
          FileOutputStream(file).use { bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 92, it) }
          val corners = DocVision.detectBitmap(bmp)
          promise.resolve(
            mapOf(
              "uri" to Uri.fromFile(file).toString(), "width" to bmp.width, "height" to bmp.height,
              "corners" to corners?.toList(),
            )
          )
          bmp.recycle()
        } catch (e: Exception) {
          promise.reject("ERR_CAPTURE", e.message ?: "Could not save the photo.", e)
        }
      }

      override fun onError(e: ImageCaptureException) {
        promise.reject("ERR_CAPTURE", e.message ?: "Could not take the photo.", e)
      }
    })
  }
}
