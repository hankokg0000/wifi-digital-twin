import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

struct Detection: Encodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let confidence: Float
    let ground: [Double]?

    init(box: CGRect, confidence: Float, ground: [Double]? = nil) {
        x = box.minX
        y = 1 - box.maxY
        width = box.width
        height = box.height
        self.confidence = confidence
        self.ground = ground
    }
}

let arguments = CommandLine.arguments.dropFirst().compactMap(Int.init)
let monitor = CommandLine.arguments.contains("--monitor")
guard arguments.count == 2, arguments[0] > 0, arguments[1] > 0 else { exit(2) }
let width = arguments[0]
let height = arguments[1]
let frameBytes = width * height * 4
let input = FileHandle.standardInput
let colorSpace = CGColorSpaceCreateDeviceRGB()
let upperBody = VNDetectHumanRectanglesRequest()
upperBody.upperBodyOnly = true
upperBody.usesCPUOnly = true
let pose = VNDetectHumanBodyPoseRequest()
pose.usesCPUOnly = true
let encoder = JSONEncoder()
let barcode = VNDetectBarcodesRequest()
barcode.symbologies = [.qr]
barcode.usesCPUOnly = true
var frameIndex = 0

struct MonitorFrame: Encodable {
    let detections: [Detection]
    let marker: [[Double]]?
    let jpeg: String
}

func markerCentre(_ mark: VNBarcodeObservation) -> [Double]? {
    let a = mark.topLeft
    let b = mark.bottomRight
    let c = mark.topRight
    let d = mark.bottomLeft
    let ux = b.x - a.x, uy = b.y - a.y
    let vx = d.x - c.x, vy = d.y - c.y
    let det = ux * vy - uy * vx
    guard abs(det) > 0.000001 else { return nil }
    let t = ((c.x - a.x) * vy - (c.y - a.y) * vx) / det
    return [a.x + t * ux, 1 - a.y - t * uy]
}

func readMarker() -> [[Double]]? {
    var points: [String: [Double]] = [:]
    for mark in barcode.results ?? [] {
        guard let name = mark.payloadStringValue, ["WDT-FLOOR-1-A", "WDT-FLOOR-1-B", "WDT-FLOOR-1-C", "WDT-FLOOR-1-D"].contains(name),
              let center = markerCentre(mark) else { continue }
        if points[name] != nil { return nil }
        points[name] = center
    }
    let ordered = ["A", "B", "C", "D"].compactMap { points["WDT-FLOOR-1-" + $0] }
    return ordered.count == 4 ? ordered : nil
}

func jpegForMonitor(_ image: CGImage) throws -> String {
    let buffer = NSMutableData()
    guard let writer = CGImageDestinationCreateWithData(buffer, UTType.jpeg.identifier as CFString, 1, nil) else {
        throw CocoaError(.coderInvalidValue)
    }
    CGImageDestinationAddImage(writer, image, [kCGImageDestinationLossyCompressionQuality: 0.56] as CFDictionary)
    guard CGImageDestinationFinalize(writer) else { throw CocoaError(.coderInvalidValue) }
    return (buffer as Data).base64EncodedString()
}

func visibleJoint(_ name: VNHumanBodyPoseObservation.JointName, in body: VNHumanBodyPoseObservation,
                  confidence: Float = 0.35) -> VNRecognizedPoint? {
    guard let point = try? body.recognizedPoint(name), point.confidence >= confidence,
          (0.01...0.99).contains(point.x), (0.01...0.99).contains(point.y) else { return nil }
    return point
}

func groundPoint(_ body: VNHumanBodyPoseObservation) -> [Double]? {
    // Require both lower legs so that a torso box or a clipped ankle cannot become a floor point.
    guard let leftKnee = visibleJoint(.leftKnee, in: body),
          let rightKnee = visibleJoint(.rightKnee, in: body),
          let left = visibleJoint(.leftAnkle, in: body, confidence: 0.50),
          let right = visibleJoint(.rightAnkle, in: body, confidence: 0.50),
          leftKnee.y > left.y, rightKnee.y > right.y else { return nil }
    let lower = left.y < right.y ? left : right
    let knee = left.y < right.y ? leftKnee : rightKnee
    let contact = lower.y - (knee.y - lower.y) * 0.10
    return contact > 0.005 ? [lower.x, 1 - contact] : nil
}

func detectablePeople() -> [Detection] {
    let rectangles = (upperBody.results ?? []).filter { $0.confidence >= 0.38 }
    var matched: Set<Int> = []
    var people: [Detection] = []
    for body in pose.results ?? [] {
        guard let neck = visibleJoint(.neck, in: body) else { continue }
        let possible = rectangles.indices.filter {
            !matched.contains($0) && rectangles[$0].boundingBox.insetBy(dx: -0.015, dy: -0.015).contains(neck.location)
        }
        if let index = possible.min(by: {
            abs(rectangles[$0].boundingBox.midX - neck.x) < abs(rectangles[$1].boundingBox.midX - neck.x)
        }) {
            matched.insert(index)
            let rectangle = rectangles[index]
            people.append(Detection(box: rectangle.boundingBox, confidence: rectangle.confidence, ground: groundPoint(body)))
            continue
        }
        let joints: [VNHumanBodyPoseObservation.JointName] = [.nose, .leftShoulder, .rightShoulder, .root]
        let points = [neck] + joints.compactMap { visibleJoint($0, in: body) }
        guard points.count >= 3 else { continue }
        let xs = points.map(\.x)
        let ys = points.map(\.y)
        guard let left = xs.min(), let right = xs.max(), let bottom = ys.min(), let top = ys.max() else { continue }
        let box = CGRect(x: left, y: bottom, width: right - left, height: top - bottom)
            .insetBy(dx: -0.012, dy: -0.012).intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        people.append(Detection(box: box, confidence: neck.confidence, ground: groundPoint(body)))
    }
    for (index, rectangle) in rectangles.enumerated() where !matched.contains(index) {
        people.append(Detection(box: rectangle.boundingBox, confidence: rectangle.confidence))
    }
    return people
}

func readFrame() throws -> Data? {
    var frame = Data(capacity: frameBytes)
    while frame.count < frameBytes {
        guard let chunk = try input.read(upToCount: frameBytes - frame.count), !chunk.isEmpty else {
            if frame.isEmpty { return nil }
            throw CocoaError(.fileReadCorruptFile)
        }
        frame.append(chunk)
    }
    return frame
}

do {
    while let frame = try readFrame() {
        try autoreleasepool {
            guard let provider = CGDataProvider(data: frame as CFData),
                  let image = CGImage(
                    width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
                    bytesPerRow: width * 4, space: colorSpace,
                    bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                    provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent
                  ) else { throw CocoaError(.coderInvalidValue) }
            let handler = VNImageRequestHandler(cgImage: image)
            let readBoard = monitor && frameIndex % 4 == 0
            try handler.perform(readBoard ? [upperBody, pose, barcode] : [upperBody, pose])
            var line: Data
            if monitor {
                line = try encoder.encode(MonitorFrame(detections: detectablePeople(),
                    marker: readBoard ? readMarker() : nil, jpeg: jpegForMonitor(image)))
            } else {
                line = try encoder.encode(detectablePeople())
            }
            frameIndex += 1
            line.append(10)
            try FileHandle.standardOutput.write(contentsOf: line)
        }
    }
} catch {
    FileHandle.standardError.write(Data("Vision could not process a frame: \(error)\n".utf8))
    exit(1)
}
