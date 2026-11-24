import CoreML
import Foundation
import ImageIO
import Vision

struct Chair: Encodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let confidence: Float
}

guard CommandLine.arguments.count == 3 else { exit(2) }
let modelURL = URL(fileURLWithPath: CommandLine.arguments[1])
let fileURL = URL(fileURLWithPath: CommandLine.arguments[2])

do {
    if CommandLine.arguments[2] == "--prepare" {
        let compiled = try MLModel.compileModel(at: modelURL)
        let destination = modelURL.deletingPathExtension().appendingPathExtension("mlmodelc")
        try FileManager.default.moveItem(at: compiled, to: destination)
        exit(0)
    }
    let configuration = MLModelConfiguration()
    configuration.computeUnits = .cpuOnly
    let model = try VNCoreMLModel(for: MLModel(contentsOf: modelURL, configuration: configuration))
    let request = VNCoreMLRequest(model: model)
    request.imageCropAndScaleOption = .scaleFill
    model.featureProvider = try MLDictionaryFeatureProvider(dictionary: [
        "confidenceThreshold": MLFeatureValue(double: 0.16),
        "iouThreshold": MLFeatureValue(double: 0.45),
    ])
    guard let source = CGImageSourceCreateWithURL(fileURL as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw CocoaError(.fileReadCorruptFile)
    }
    let width = CGFloat(image.width)
    let height = CGFloat(image.height)
    let tiles = [CGRect(x: 0, y: 0, width: width, height: height),
                 CGRect(x: 0, y: height * 0.24, width: width * 0.61, height: height * 0.76).integral,
                 CGRect(x: width * 0.37, y: height * 0.24, width: width * 0.63, height: height * 0.76).integral]
    var chairs: [Chair] = []
    for tile in tiles {
        guard let crop = image.cropping(to: tile) else { continue }
        try VNImageRequestHandler(cgImage: crop).perform([request])
        for observation in (request.results as? [VNRecognizedObjectObservation] ?? []) {
            guard let label = observation.labels.first, label.identifier.lowercased() == "chair" else { continue }
            let box = observation.boundingBox
            chairs.append(Chair(
                x: (tile.minX + box.minX * tile.width) / width,
                y: (tile.minY + (1 - box.maxY) * tile.height) / height,
                width: box.width * tile.width / width, height: box.height * tile.height / height,
                confidence: label.confidence
            ))
        }
    }
    try FileHandle.standardOutput.write(contentsOf: JSONEncoder().encode(chairs))
} catch {
    FileHandle.standardError.write(Data("Chair detection failed: \(error)\n".utf8))
    exit(1)
}
