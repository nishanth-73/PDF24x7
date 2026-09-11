Pod::Spec.new do |s|
  s.name           = 'PdfThumbnails'
  s.version        = '1.0.0'
  s.summary        = 'Renders PDF pages to JPEG thumbnails with PDFKit'
  s.description    = 'Renders PDF pages to JPEG thumbnails with PDFKit'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
