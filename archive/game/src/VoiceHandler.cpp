#include "VoiceHandler.h"
#include <algorithm>
#include <chrono>
#include <iostream>
#include <thread>

VoiceHandler::VoiceHandler() {}
VoiceHandler::~VoiceHandler() {
    stop();
}

void VoiceHandler::setCallback(Callback cb) {
    callback = std::move(cb);
}

void VoiceHandler::start() {
    if (running) return;
    running = true;
    worker = std::thread(&VoiceHandler::threadLoop, this);
}

void VoiceHandler::stop() {
    if (!running) return;
    running = false;
    if (worker.joinable()) {
        worker.join();
    }
}

std::string VoiceHandler::processSpeechResult(const std::string& raw) {
    std::string lower = raw;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);

    if (lower.find("strike") != std::string::npos) return "Strike";
    if (lower.find("ignis") != std::string::npos) return "Ignis";
    if (lower.find("heal") != std::string::npos) return "Heal";
    return "";
}

void VoiceHandler::threadLoop() {
    // TODO: integrate Vosk STT for offline speech recognition.
    // See: https://alphacephei.com/vosk
    // On a real setup, decode microphone chunk -> recognizer -> result JSON -> call callback.

    std::vector<std::string> simulatedWords{"Strike", "Ignis", "Heal", ""};
    size_t index = 0;

    while (running) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1200));

        std::string simulated = simulatedWords[index++ % simulatedWords.size()];
        std::string result = processSpeechResult(simulated);
        if (!result.empty()) {
            if (callback) callback(result);
            std::cout << "VoiceHandler (simulated) recognized: " << result << "\n";
        }
    }
}
