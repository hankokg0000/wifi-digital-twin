import CoreGraphics
import CoreML
import CoreVideo
import Foundation
import Vision

enum DepthError: Error {
    case arguments, inputImage, modelInput, modelOutput, emptyDepth
}

let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 2 else { exit(2) }
let modelURL = URL(fileURLWithPath: args[0])

func depthBytes(_ buffer: CVPixelBuffer, width: Int, height: Int) throws -> [Float] {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { throw DepthError.modelOutput }
    let sourceWidth = CVPixelBufferGetWidth(buffer)
    let sourceHeight = CVPixelBufferGetHeight(buffer)
    let stride = CVPixelBufferGetBytesPerRow(buffer)
    let format = CVPixelBufferGetPixelFormatType(buffer)
    guard format == kCVPixelFormatType_OneComponent16Half || format == kCVPixelFormatType_OneComponent32Float ||
          format == kCVPixelFormatType_OneComponent8 else { throw DepthError.modelOutput }

    var values: [Float] = []
    values.reserveCapacity(width * height)
    for y in 0..<height {
        let row = base.advanced(by: min(sourceHeight - 1, (2 * y + 1) * sourceHeight / (2 * height)) * stride)
        for x in 0..<width {
            let index = min(sourceWidth - 1, (2 * x + 1) * sourceWidth / (2 * width))
            switch format {
            case kCVPixelFormatType_OneComponent16Half:
                values.append(Float(Float16(bitPattern: row.assumingMemoryBound(to: UInt16.self)[index])))
            case kCVPixelFormatType_OneComponent32Float:
                values.append(row.assumingMemoryBound(to: Float.self)[index])
            default:
                values.append(Float(row.assumingMemoryBound(to: UInt8.self)[index]))
            }
        }
    }
    return values
}

do {
    if args[1] == "--prepare" {
        let temporary = try MLModel.compileModel(at: modelURL)
        defer { try? FileManager.default.removeItem(at: temporary) }
        let target = modelURL.deletingPathExtension().appendingPathExtension("mlmodelc")
        try FileManager.default.moveItem(at: temporary, to: target)
        exit(0)
    }

    guard args.count == 4, let width = Int(args[2]), let height = Int(args[3]),
          (1...1920).contains(width), (1...1080).contains(height) else { throw DepthError.arguments }
    let rgb = try Data(contentsOf: URL(fileURLWithPath: args[1]))
    guard rgb.count == width * height * 3,
          let provider = CGDataProvider(data: rgb as CFData),
          let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 24,
              bytesPerRow: 3 * width, space: CGColorSpaceCreateDeviceRGB(),
              bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue), provider: provider,
              decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { throw DepthError.inputImage }

    let configuration = MLModelConfiguration()
    configuration.computeUnits = .cpuAndGPU
    let model = try MLModel(contentsOf: modelURL, configuration: configuration)
    guard let input = model.modelDescription.inputDescriptionsByName.values.first,
          let constraint = input.imageConstraint else { throw DepthError.modelInput }
    let imageInput = try MLFeatureValue(cgImage: image, constraint: constraint, options: [.cropAndScale: VNImageCropAndScaleOption.scaleFill.rawValue])
    let prediction = try model.prediction(from: MLDictionaryFeatureProvider(dictionary: [input.name: imageInput]))
    guard let output = prediction.featureNames.compactMap({ prediction.featureValue(for: $0)?.imageBufferValue }).first else {
        throw DepthError.modelOutput
    }
    let depth = try depthBytes(output, width: width, height: height)
    guard depth.contains(where: { $0.isFinite && $0 > 0 }) else { throw DepthError.emptyDepth }
    try FileHandle.standardOutput.write(contentsOf: JSONEncoder().encode(depth.map { $0.isFinite ? $0 : 0 }))
} catch {
    FileHandle.standardError.write(Data("Depth estimation failed: \(error)\n".utf8))
    exit(1)
}
