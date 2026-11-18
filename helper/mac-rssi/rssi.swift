import CoreWLAN
import Foundation

// อ่านค่า RSSI ของ WiFi บนเครื่องนี้ แล้วพิมพ์เป็น JSON หนึ่งบรรทัดต่อหนึ่งครั้ง (stdout)
var hz = 10.0
let args = CommandLine.arguments
if let i = args.firstIndex(of: "--hz"), i + 1 < args.count, let v = Double(args[i + 1]), v > 0 {
  hz = min(v, 50)
}
let interval = 1.0 / hz
setvbuf(stdout, nil, _IOLBF, 0)

func emit(_ s: String) {
  print(s)
  fflush(stdout)
}

var lastError = 0.0
while true {
  let started = Date()
  if let iface = CWWiFiClient.shared().interface() {
    let ts = Int((Date().timeIntervalSince1970 * 1000).rounded())
    let channel = iface.wlanChannel()?.channelNumber ?? 0
    emit("{\"ts\":\(ts),\"rssi\":\(iface.rssiValue()),\"noise\":\(iface.noiseMeasurement()),\"channel\":\(channel)}")
  } else if started.timeIntervalSince1970 - lastError >= 1 {
    lastError = started.timeIntervalSince1970
    emit("{\"error\":\"no wifi interface\"}")
  }
  let rest = interval - Date().timeIntervalSince(started)
  if rest > 0 { Thread.sleep(forTimeInterval: rest) }
}
