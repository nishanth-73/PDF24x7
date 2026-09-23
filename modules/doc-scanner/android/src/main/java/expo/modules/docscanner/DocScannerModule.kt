package expo.modules.docscanner

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class StrokeRecord : Record {
  @Field val shape: String = "path" // path | rect | fill | ellipse
  @Field val points: List<Double> = emptyList() // x,y pairs as fractions of the finished image
  @Field val width: Double = 0.01 // fraction of image width
  @Field val color: String = "#000000"
}

class ProcessOptions : Record {
  @Field val corners: DoubleArray? = null
  @Field val rotation: Int = 0
  @Field val filter: String = "original" // original | auto | light | gray | whiteboard
  @Field val brightness: Double = 0.0 // -1..1
  @Field val contrast: Double = 0.0 // -1..1
  @Field val strokes: List<StrokeRecord> = emptyList()
  @Field val maxSize: Int = 2400
  @Field val dest: String? = null // file uri to write; a new cache file when omitted
}

class DocScannerModule : Module() {
  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("DocScanner")

    OnCreate {
      appContext.reactContext?.let { ctx -> DocModel.source = { ctx.assets.open(DocModel.ASSET).use { it.readBytes() } } }
    }

    // Finds the page in an existing photo (gallery import). Loads upright, like process().
    AsyncFunction("detect") { uri: String ->
      val bmp = DocVision.load(context, uri, 1600)
      val corners = DocVision.detectBitmap(bmp)
      mapOf("uri" to uri, "width" to bmp.width, "height" to bmp.height, "corners" to corners?.toList()).also { bmp.recycle() }
    }

    // What to keep of a rendered PDF page, [x, y, w, h] fractions, or null when there's nothing to trim.
    AsyncFunction("autoCrop") { uri: String ->
      val bmp = DocVision.load(context, uri, 1200)
      try {
        DocVision.autoCrop(bmp)?.toList()
      } finally {
        bmp.recycle()
      }
    }

    AsyncFunction("process") { uri: String, options: ProcessOptions ->
      DocVision.process(context, uri, options)
    }

    View(DocCameraView::class) {
      Events("onDetect", "onQr")
      Prop("flash") { view: DocCameraView, value: String -> view.flash = value }
      Prop("detect") { view: DocCameraView, value: Boolean -> view.detecting = value }
      Prop("qr") { view: DocCameraView, value: Boolean -> view.qr = value }
      AsyncFunction("capture") { view: DocCameraView, promise: Promise -> view.takePicture(promise) }
      OnViewDestroys { view: DocCameraView -> view.destroy() }
    }
  }
}
