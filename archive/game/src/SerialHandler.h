#pragma once

#include <atomic>
#include <functional>
#include <string>
#include <thread>
#include "SharedStatus.h"

class SerialHandler {
public:
    using Callback = std::function<void(GloveState)>;

    SerialHandler(const std::string& port = "COM9", int baud = 115200);
    ~SerialHandler();

    void setCallback(Callback cb);
    void start();
    void stop();

private:
    void threadLoop();
    GloveState parseGlove(const std::string& s);

    std::string port;
    int baudRate;
    std::thread worker;
    std::atomic<bool> running{false};
    Callback callback;
};
