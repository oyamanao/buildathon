#pragma once

#include <atomic>
#include <functional>
#include <string>
#include <thread>

class VoiceHandler {
public:
    using Callback = std::function<void(const std::string&)>;

    VoiceHandler();
    ~VoiceHandler();

    void setCallback(Callback cb);
    void start();
    void stop();

private:
    void threadLoop();
    std::string processSpeechResult(const std::string& raw);

    std::thread worker;
    std::atomic<bool> running{false};
    Callback callback;
};
