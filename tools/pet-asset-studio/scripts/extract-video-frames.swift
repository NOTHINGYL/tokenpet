import AppKit
import AVFoundation
import CoreImage
import Foundation

enum ExtractError: Error, CustomStringConvertible {
  case usage
  case noVideoTrack
  case readerStart
  case imageEncode(Int)

  var description: String {
    switch self {
    case .usage:
      return "usage: swift extract-video-frames.swift <input-video> <output-directory>"
    case .noVideoTrack:
      return "input has no video track"
    case .readerStart:
      return "AVAssetReader could not start"
    case .imageEncode(let index):
      return "could not encode frame \(index) as PNG"
    }
  }
}

func writePNG(_ image: CGImage, to url: URL, index: Int) throws {
  let representation = NSBitmapImageRep(cgImage: image)
  guard let data = representation.representation(using: .png, properties: [:]) else {
    throw ExtractError.imageEncode(index)
  }
  try data.write(to: url, options: .atomic)
}

func main() throws {
  guard CommandLine.arguments.count == 3 else { throw ExtractError.usage }
  let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
  let outputURL = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
  let framesURL = outputURL.appendingPathComponent("frames", isDirectory: true)
  try FileManager.default.createDirectory(at: framesURL, withIntermediateDirectories: true)

  let asset = AVURLAsset(url: inputURL)
  guard let track = asset.tracks(withMediaType: .video).first else {
    throw ExtractError.noVideoTrack
  }

  let reader = try AVAssetReader(asset: asset)
  let output = AVAssetReaderTrackOutput(
    track: track,
    outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    ]
  )
  output.alwaysCopiesSampleData = false
  reader.add(output)
  guard reader.startReading() else { throw ExtractError.readerStart }

  let context = CIContext(options: [.cacheIntermediates: false])
  let transform = track.preferredTransform
  var frameIndex = 0
  var timestamps: [Double] = []
  var outputWidth = 0
  var outputHeight = 0

  while let sample = output.copyNextSampleBuffer() {
    autoreleasepool {
      guard let buffer = CMSampleBufferGetImageBuffer(sample) else { return }
      let timestamp = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
      var image = CIImage(cvPixelBuffer: buffer).transformed(by: transform)
      let transformedExtent = image.extent.integral
      image = image.transformed(
        by: CGAffineTransform(
          translationX: -transformedExtent.origin.x,
          y: -transformedExtent.origin.y
        )
      )
      let extent = image.extent.integral
      guard let cgImage = context.createCGImage(image, from: extent) else { return }
      frameIndex += 1
      outputWidth = cgImage.width
      outputHeight = cgImage.height
      timestamps.append(timestamp)
      let filename = String(format: "frame_%06d.png", frameIndex)
      do {
        try writePNG(cgImage, to: framesURL.appendingPathComponent(filename), index: frameIndex)
      } catch {
        fputs("\(error)\n", stderr)
        exit(2)
      }
    }
  }

  if reader.status == .failed, let error = reader.error { throw error }

  let duration = CMTimeGetSeconds(asset.duration)
  let averageFps: Double
  if timestamps.count > 1, let first = timestamps.first, let last = timestamps.last, last > first {
    averageFps = Double(timestamps.count - 1) / (last - first)
  } else {
    averageFps = Double(track.nominalFrameRate)
  }
  let metadata: [String: Any] = [
    "input": inputURL.path,
    "durationSeconds": duration,
    "frameCount": frameIndex,
    "nominalFrameRate": track.nominalFrameRate,
    "averageFrameRate": averageFps,
    "naturalWidth": track.naturalSize.width,
    "naturalHeight": track.naturalSize.height,
    "outputWidth": outputWidth,
    "outputHeight": outputHeight,
    "hasAudio": !asset.tracks(withMediaType: .audio).isEmpty,
    "timestampsSeconds": timestamps,
  ]
  let metadataData = try JSONSerialization.data(withJSONObject: metadata, options: [.prettyPrinted, .sortedKeys])
  try metadataData.write(to: outputURL.appendingPathComponent("metadata.json"), options: .atomic)
  print("extracted \(frameIndex) frames at \(String(format: "%.3f", averageFps)) fps, \(outputWidth)x\(outputHeight), duration \(String(format: "%.3f", duration))s")
}

do {
  try main()
} catch {
  fputs("extract-video-frames: \(error)\n", stderr)
  exit(1)
}
