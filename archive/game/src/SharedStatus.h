#pragma once

#include <atomic>
#include <chrono>
#include <mutex>
#include <string>

enum class GloveState { REST = 0, GUARD = 1, GRASP = 2, CHANNEL = 3 };
enum class ComboResult { NONE = 0, PHYSICAL_ATTACK = 1, FIRE_SPELL = 2, DEFEND_STATE = 3 };

struct SharedStatus {
    std::atomic<GloveState> gloveState{GloveState::REST};
    std::atomic<ComboResult> comboResult{ComboResult::NONE};

    std::mutex voiceMutex;
    std::string lastVoiceWord{"None"};
    std::chrono::steady_clock::time_point voiceExpiry = std::chrono::steady_clock::now();

    bool isVoiceValid() {
        std::lock_guard<std::mutex> lock(voiceMutex);
        return std::chrono::steady_clock::now() <= voiceExpiry;
    }

    std::string getVoiceWord() {
        std::lock_guard<std::mutex> lock(voiceMutex);
        if (std::chrono::steady_clock::now() <= voiceExpiry) {
            return lastVoiceWord;
        }
        return "None";
    }

    void setVoiceWord(const std::string& word, std::chrono::seconds life = std::chrono::seconds(2)) {
        std::lock_guard<std::mutex> lock(voiceMutex);
        lastVoiceWord = word;
        voiceExpiry = std::chrono::steady_clock::now() + life;
    }
};
