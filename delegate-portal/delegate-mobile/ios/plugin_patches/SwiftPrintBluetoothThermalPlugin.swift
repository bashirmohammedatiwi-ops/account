import Flutter
import UIKit
import CoreBluetooth

public class SwiftPrintBluetoothThermalPlugin: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate, FlutterPlugin {
    var centralManager: CBCentralManager?
    var discoveredDevices: [String] = []
    var discoveredPeripherals: [String: CBPeripheral] = [:]
    var connectedPeripheral: CBPeripheral?
    var targetCharacteristic: CBCharacteristic?

    var pendingConnectResult: FlutterResult?
    var pendingConnectUuid: String?
    var connectResultDelivered = false
    var characteristicReadyTimeoutWorkItem: DispatchWorkItem?

    var stringprint = ""

    private enum ScanMode {
        case printerServices
        case strictBroad
        case targetedConnect
    }

    private var scanMode: ScanMode = .printerServices

    private static let printerServiceUUIDStrings = [
        "00001101-0000-1000-8000-00805F9B34FB",
        "49535343-FE7D-4AE5-8FA9-9FAFD205E455",
        "A76EB9E0-F3AC-4990-84CF-3A94D2426B2B",
        "0000FFE0-0000-1000-8000-00805F9B34FB",
        "6E400001-B5A3-F393-E0A9-E8E5E27CB72DF",
        "000018F0-0000-1000-8000-00805F9B34FB",
        "E7810A71-73AE-499D-8C15-4696ACE6630B"
    ]

    private static let printerCharacteristicUUIDStrings = [
        "00001101-0000-1000-8000-00805F9B34FB",
        "49535343-8841-43F4-A8D4-ECBE34729BB3",
        "A76EB9E2-F3AC-4990-84CF-3A94D2426B2B",
        "0000FFE1-0000-1000-8000-00805F9B34FB",
        "6E400002-B5A3-F393-E0A9-E8E5E27CB72DF"
    ]

    // Strict keywords only — avoid short tokens like "rp", "xp", "esc", "mini".
    private static let printerNameKeywords = [
        "printer", "thermal", "barcode", "4barcode", "4b-", "4b_",
        "2033pa", "xprinter", "goojprt", "mpt-", "mpt_", "mpt3", "mpt2",
        "rpp", "tsc", "escpos", "posprinter", "bluetooth printer",
        "label printer", "طابعة", "print_"
    ]

    public static func register(with registrar: FlutterPluginRegistrar) {
        let channel = FlutterMethodChannel(name: "groons.web.app/print", binaryMessenger: registrar.messenger())
        let instance = SwiftPrintBluetoothThermalPlugin()
        registrar.addMethodCallDelegate(instance, channel: channel)
    }

    private func ensureCentralManager() {
        if centralManager == nil {
            centralManager = CBCentralManager(delegate: self, queue: nil)
        }
    }

    private func deliverResult(_ result: @escaping FlutterResult, value: Any?) {
        DispatchQueue.main.async {
            result(value)
        }
    }

    private func finishPendingConnect(success: Bool) {
        guard !connectResultDelivered, let pending = pendingConnectResult else { return }
        connectResultDelivered = true
        pendingConnectResult = nil
        pendingConnectUuid = nil
        characteristicReadyTimeoutWorkItem?.cancel()
        characteristicReadyTimeoutWorkItem = nil
        centralManager?.stopScan()
        DispatchQueue.main.async {
            pending(success)
        }
    }

    private func printerServiceUUIDs() -> [CBUUID] {
        Self.printerServiceUUIDStrings.compactMap { s in
            guard let uuid = UUID(uuidString: s) else { return nil }
            return CBUUID(nsuuid: uuid)
        }
    }

    private func isPrinterServiceUUID(_ uuid: CBUUID) -> Bool {
        let value = uuid.uuidString.uppercased()
        return Self.printerServiceUUIDStrings.contains { $0.uppercased() == value }
    }

    private func actualDeviceName(_ peripheral: CBPeripheral, advertisementData: [String: Any]) -> String? {
        if let name = peripheral.name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
            return name
        }
        if let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String {
            let trimmed = localName.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
        }
        return nil
    }

    private func displayName(_ peripheral: CBPeripheral, advertisementData: [String: Any]) -> String {
        actualDeviceName(peripheral, advertisementData: advertisementData) ?? "طابعة Bluetooth"
    }

    private func nameLooksLikePrinter(_ name: String) -> Bool {
        let lowered = name.lowercased()
        return Self.printerNameKeywords.contains { lowered.contains($0) }
    }

    private func advertisedPrinterServices(_ advertisementData: [String: Any]) -> Bool {
        if let services = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] {
            for service in services where isPrinterServiceUUID(service) {
                return true
            }
        }
        if let overflow = advertisementData[CBAdvertisementDataOverflowServiceUUIDsKey] as? [CBUUID] {
            for service in overflow where isPrinterServiceUUID(service) {
                return true
            }
        }
        if let serviceData = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data] {
            for key in serviceData.keys where isPrinterServiceUUID(key) {
                return true
            }
        }
        return false
    }

    private func isConnectable(_ advertisementData: [String: Any]) -> Bool {
        if let connectable = advertisementData[CBAdvertisementDataIsConnectable] as? Bool {
            return connectable
        }
        if let connectable = advertisementData[CBAdvertisementDataIsConnectable] as? NSNumber {
            return connectable.boolValue
        }
        return true
    }

    private func isLikelyPrinter(_ peripheral: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) -> Bool {
        if rssi.intValue < -88 { return false }
        if !isConnectable(advertisementData) { return false }
        if advertisedPrinterServices(advertisementData) { return true }
        guard let name = actualDeviceName(peripheral, advertisementData: advertisementData) else {
            return false
        }
        return nameLooksLikePrinter(name)
    }

    private func rememberPeripheral(_ peripheral: CBPeripheral, advertisementData: [String: Any] = [:]) {
        let deviceAddress = peripheral.identifier.uuidString
        discoveredPeripherals[deviceAddress] = peripheral
        let deviceName = displayName(peripheral, advertisementData: advertisementData)
        let device = "\(deviceName)#\(deviceAddress)"
        if !discoveredDevices.contains(device) {
            discoveredDevices.append(device)
        }
    }

    private func resolvePeripheral(uuid: UUID) -> CBPeripheral? {
        let uuidString = uuid.uuidString
        if let cached = discoveredPeripherals[uuidString] {
            return cached
        }
        if let retrieved = centralManager?.retrievePeripherals(withIdentifiers: [uuid]).first {
            return retrieved
        }
        let services = printerServiceUUIDs()
        if !services.isEmpty {
            return centralManager?.retrieveConnectedPeripherals(withServices: services)
                .first { $0.identifier == uuid }
        }
        return nil
    }

    private func preloadKnownPeripherals() {
        guard centralManager?.state == .poweredOn else { return }
        let services = printerServiceUUIDs()
        for peripheral in centralManager!.retrieveConnectedPeripherals(withServices: services) {
            rememberPeripheral(peripheral)
        }
    }

    private func startPrinterServiceScan() {
        guard centralManager?.state == .poweredOn else { return }
        scanMode = .printerServices
        preloadKnownPeripherals()
        centralManager?.scanForPeripherals(
            withServices: printerServiceUUIDs(),
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    private func startStrictBroadScan() {
        guard centralManager?.state == .poweredOn else { return }
        scanMode = .strictBroad
        centralManager?.scanForPeripherals(
            withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    private func startTargetedConnectScan() {
        guard centralManager?.state == .poweredOn else { return }
        scanMode = .targetedConnect
        centralManager?.stopScan()
        centralManager?.scanForPeripherals(
            withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    private func connectPeripheral(uuid: UUID, result: @escaping FlutterResult) {
        ensureCentralManager()
        guard centralManager?.state == .poweredOn else {
            deliverResult(result, value: false)
            return
        }

        if let connected = connectedPeripheral,
           connected.identifier == uuid,
           connected.state == .connected,
           targetCharacteristic != nil {
            deliverResult(result, value: true)
            return
        }

        pendingConnectResult = result
        pendingConnectUuid = uuid.uuidString
        connectResultDelivered = false
        targetCharacteristic = nil

        if let peripheral = resolvePeripheral(uuid: uuid) {
            discoveredPeripherals[uuid.uuidString] = peripheral
            if peripheral.state == .connected {
                connectedPeripheral = peripheral
                peripheral.delegate = self
                peripheral.discoverServices(nil)
                scheduleCharacteristicReadyTimeout(for: peripheral)
            } else {
                centralManager?.connect(peripheral, options: nil)
            }
        } else {
            startTargetedConnectScan()
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
                guard let self = self else { return }
                if self.pendingConnectUuid == uuid.uuidString && !self.connectResultDelivered {
                    self.startPrinterServiceScan()
                }
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
            guard let self = self else { return }
            if self.pendingConnectUuid == uuid.uuidString {
                self.finishPendingConnect(success: false)
            }
        }
    }

    private func scheduleCharacteristicReadyTimeout(for peripheral: CBPeripheral) {
        characteristicReadyTimeoutWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            guard self.pendingConnectUuid == peripheral.identifier.uuidString,
                  !self.connectResultDelivered else { return }
            if self.targetCharacteristic != nil {
                self.finishPendingConnect(success: true)
            } else {
                self.centralManager?.cancelPeripheralConnection(peripheral)
                self.finishPendingConnect(success: false)
            }
        }
        characteristicReadyTimeoutWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 18, execute: work)
    }

    private func markCharacteristicReadyIfPending(peripheral: CBPeripheral) {
        guard pendingConnectUuid == peripheral.identifier.uuidString,
              !connectResultDelivered,
              targetCharacteristic != nil else { return }
        finishPendingConnect(success: true)
    }

    private func isAllowedCharacteristic(_ characteristic: CBCharacteristic) -> Bool {
        let allowed = Self.printerCharacteristicUUIDStrings
        let uuid = characteristic.uuid.uuidString.uppercased()
        return allowed.contains { $0.uppercased() == uuid } ||
            characteristic.properties.contains(.write) ||
            characteristic.properties.contains(.writeWithoutResponse)
    }

    public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        ensureCentralManager()

        switch call.method {
        case "getPlatformVersion":
            deliverResult(result, value: "iOS " + UIDevice.current.systemVersion)
        case "getBatteryLevel":
            deliverResult(result, value: Int(UIDevice.current.batteryLevel * 100))
        case "bluetoothenabled":
            deliverResult(result, value: centralManager?.state == .poweredOn)
        case "ispermissionbluetoothgranted":
            deliverResult(result, value: centralManager?.state == .poweredOn)
        case "pairedbluetooths":
            discoveredDevices = []
            discoveredPeripherals = [:]

            if centralManager?.state == .poweredOn {
                startPrinterServiceScan()
                DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
                    guard let self = self else { return }
                    self.startStrictBroadScan()
                }
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
                guard let self = self else { return }
                self.centralManager?.stopScan()
                result(self.discoveredDevices)
            }
        case "connect":
            guard let macAddress = call.arguments as? String,
                  let deviceUuid = UUID(uuidString: macAddress) else {
                deliverResult(result, value: false)
                return
            }
            connectPeripheral(uuid: deviceUuid, result: result)
        case "connectionstatus":
            let ready = connectedPeripheral?.state == .connected && targetCharacteristic != nil
            deliverResult(result, value: ready)
        case "writebytes":
            guard let characteristic = targetCharacteristic,
                  let listbytes = call.arguments as? [UInt8] else {
                deliverResult(result, value: false)
                return
            }
            let data = Data(listbytes)
            let chunkSize = 150
            var offset = 0
            var writeType = CBCharacteristicWriteType.withoutResponse
            if characteristic.properties.contains(.write) {
                writeType = .withResponse
            }
            while offset < data.count {
                let chunkRange = offset..<min(offset + chunkSize, data.count)
                connectedPeripheral?.writeValue(data.subdata(in: chunkRange), for: characteristic, type: writeType)
                offset += chunkSize
            }
            deliverResult(result, value: true)
        case "printstring":
            stringprint = call.arguments as? String ?? ""
            guard let characteristic = targetCharacteristic, stringprint.count > 0 else {
                deliverResult(result, value: false)
                return
            }
            var size = 2
            var texto = stringprint
            let linea = stringprint.components(separatedBy: "///")
            if linea.count > 1 {
                size = Int(linea[0]) ?? 2
                texto = String(linea[1])
                if size < 1 || size > 5 { size = 2 }
            }
            let sizeBytes: [[UInt8]] = [
                [0x1d, 0x21, 0x00],
                [0x1b, 0x4d, 0x01],
                [0x1b, 0x4d, 0x00],
                [0x1d, 0x21, 0x11],
                [0x1d, 0x21, 0x22],
                [0x1d, 0x21, 0x33]
            ]
            let resetBytes: [UInt8] = [0x1b, 0x40]
            var writeType = CBCharacteristicWriteType.withoutResponse
            if characteristic.properties.contains(.write) {
                writeType = .withResponse
            }
            connectedPeripheral?.writeValue(Data(sizeBytes[size]), for: characteristic, type: writeType)
            connectedPeripheral?.writeValue(Data(texto.utf8), for: characteristic, type: writeType)
            connectedPeripheral?.writeValue(Data(resetBytes), for: characteristic, type: writeType)
            stringprint = ""
            deliverResult(result, value: true)
        case "disconnect":
            if let peripheral = connectedPeripheral {
                centralManager?.cancelPeripheralConnection(peripheral)
            }
            connectedPeripheral = nil
            targetCharacteristic = nil
            deliverResult(result, value: true)
        default:
            deliverResult(result, value: FlutterMethodNotImplemented)
        }
    }

    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        if let pendingUuid = pendingConnectUuid, peripheral.identifier.uuidString == pendingUuid {
            central.stopScan()
            discoveredPeripherals[pendingUuid] = peripheral
            rememberPeripheral(peripheral, advertisementData: advertisementData)
            if peripheral.state == .connected {
                connectedPeripheral = peripheral
                peripheral.delegate = self
                peripheral.discoverServices(nil)
                scheduleCharacteristicReadyTimeout(for: peripheral)
            } else {
                central.connect(peripheral, options: nil)
            }
            return
        }

        let shouldList: Bool
        switch scanMode {
        case .printerServices:
            shouldList = true
        case .strictBroad:
            shouldList = isLikelyPrinter(peripheral, advertisementData: advertisementData, rssi: RSSI)
        case .targetedConnect:
            shouldList = false
        }

        if shouldList {
            rememberPeripheral(peripheral, advertisementData: advertisementData)
        }
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        guard pendingConnectUuid == peripheral.identifier.uuidString else { return }
        connectedPeripheral = peripheral
        peripheral.delegate = self
        peripheral.discoverServices(nil)
        scheduleCharacteristicReadyTimeout(for: peripheral)
    }

    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        if pendingConnectUuid == peripheral.identifier.uuidString {
            finishPendingConnect(success: false)
        }
    }

    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if connectedPeripheral?.identifier == peripheral.identifier {
            connectedPeripheral = nil
            targetCharacteristic = nil
        }
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let services = peripheral.services else { return }
        for service in services {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil, let discoveredCharacteristics = service.characteristics else { return }
        for characteristic in discoveredCharacteristics where isAllowedCharacteristic(characteristic) {
            targetCharacteristic = characteristic
            markCharacteristicReadyIfPending(peripheral: peripheral)
            return
        }
    }

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        // no-op
    }
}
