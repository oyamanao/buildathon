#include "SerialHandler.h"
#include <windows.h>
#include <iostream>

SerialHandler::SerialHandler(const std::string& port_, int baud)
    : port(port_), baudRate(baud) {}

SerialHandler::~SerialHandler() {
    stop();
}

void SerialHandler::setCallback(Callback cb) {
    callback = std::move(cb);
}

void SerialHandler::start() {
    if (running) return;
    running = true;
    worker = std::thread(&SerialHandler::threadLoop, this);
}

void SerialHandler::stop() {
    if (!running) return;
    running = false;
    if (worker.joinable()) {
        worker.join();
    }
}

GloveState SerialHandler::parseGlove(const std::string& s) {
    if (s == "00") return GloveState::REST;
    if (s == "01") return GloveState::GUARD;
    if (s == "10") return GloveState::GRASP;
    if (s == "11") return GloveState::CHANNEL;
    return GloveState::REST;
}

void SerialHandler::threadLoop() {
    HANDLE hSerial = CreateFileA(
        port.c_str(),
        GENERIC_READ | GENERIC_WRITE,
        0,
        nullptr,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        nullptr);

    if (hSerial == INVALID_HANDLE_VALUE) {
        std::cerr << "SerialHandler: failed to open " << port << ". Running simulation mode.\n";
    } else {
        DCB dcbSerialParams = {0};
        dcbSerialParams.DCBlength = sizeof(dcbSerialParams);
        if (!GetCommState(hSerial, &dcbSerialParams)) {
            std::cerr << "SerialHandler: GetCommState failed\n";
        } else {
            dcbSerialParams.BaudRate = baudRate;
            dcbSerialParams.ByteSize = 8;
            dcbSerialParams.StopBits = ONESTOPBIT;
            dcbSerialParams.Parity = NOPARITY;
            SetCommState(hSerial, &dcbSerialParams);

            COMMTIMEOUTS timeouts = {0};
            timeouts.ReadIntervalTimeout = 50;
            timeouts.ReadTotalTimeoutConstant = 50;
            timeouts.ReadTotalTimeoutMultiplier = 10;
            SetCommTimeouts(hSerial, &timeouts);

            std::string buffer;
            char ch;
            DWORD bytesRead;

            while (running) {
                if (!ReadFile(hSerial, &ch, 1, &bytesRead, nullptr)) {
                    break;
                }
                if (bytesRead == 0) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(20));
                    continue;
                }
                if (ch == '\n' || ch == '\r') {
                    if (!buffer.empty()) {
                        GloveState state = parseGlove(buffer);
                        if (callback) callback(state);
                        buffer.clear();
                    }
                } else {
                    buffer.push_back(ch);
                }
            }

            CloseHandle(hSerial);
            hSerial = INVALID_HANDLE_VALUE;
        }
    }

    // Fallback simulation when serial not available
    std::vector<std::string> simulated{"00","10","11","01"};
    size_t idx = 0;
    while (running) {
        std::this_thread::sleep_for(std::chrono::milliseconds(250));
        if (hSerial != INVALID_HANDLE_VALUE) break; // serial mode already running
        std::string frame = simulated[idx++ % simulated.size()];
        if (callback) callback(parseGlove(frame));
    }
}
