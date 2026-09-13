package expo.modules.docscanner

import android.app.Activity
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Launches Google's ML Kit document scanner. It runs inside Play services, so the APK carries no model or camera code.
class DocScannerModule : Module() {
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("DocScanner")

    AsyncFunction("scan") { pageLimit: Int, promise: Promise ->
      if (pending != null) {
        promise.reject("ERR_SCAN_BUSY", "The scanner is already open.", null)
        return@AsyncFunction
      }
      val activity = appContext.throwingActivity
      val options = GmsDocumentScannerOptions.Builder()
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL) // crop, rotate, filters, stain & finger cleanup
        .setGalleryImportAllowed(true)
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        .apply { if (pageLimit > 0) setPageLimit(pageLimit) }
        .build()
      GmsDocumentScanning.getClient(options).getStartScanIntent(activity)
        .addOnSuccessListener { sender ->
          pending = promise
          activity.startIntentSenderForResult(sender, REQUEST_CODE, null, 0, 0, 0)
        }
        .addOnFailureListener { e -> promise.reject("ERR_SCAN_UNAVAILABLE", e.message ?: "Document scanner unavailable.", e) }
    }

    OnActivityResult { _, (requestCode, resultCode, data) ->
      if (requestCode != REQUEST_CODE) return@OnActivityResult
      val promise = pending ?: return@OnActivityResult
      pending = null
      val result = if (resultCode == Activity.RESULT_OK) GmsDocumentScanningResult.fromActivityResultIntent(data) else null
      promise.resolve(result?.pages?.map { it.imageUri.toString() } ?: emptyList<String>())
    }
  }

  private companion object {
    const val REQUEST_CODE = 4217
  }
}
