#include "SerialHandler.h"
#include "VoiceHandler.h"
#include "SharedStatus.h"
#include <chrono>
#include <string>
#include <iostream>
#include <thread>
#ifdef _WIN32
#include <conio.h>
#endif

ComboResult resolveCombo(GloveState glove, const std::string& voiceWord) {
    if (glove == GloveState::GRASP && voiceWord == "Strike") return ComboResult::PHYSICAL_ATTACK;
    if (glove == GloveState::CHANNEL && voiceWord == "Ignis") return ComboResult::FIRE_SPELL;
    if (glove == GloveState::GUARD) return ComboResult::DEFEND_STATE;
    return ComboResult::NONE;
}

std::string gloveStateName(GloveState s) {
    switch (s) {
        case GloveState::REST: return "REST";
        case GloveState::GUARD: return "GUARD";
        case GloveState::GRASP: return "GRASP";
        case GloveState::CHANNEL: return "CHANNEL";
        default: return "UNKNOWN";
    }
}

std::string comboName(ComboResult r) {
    switch (r) {
        case ComboResult::PHYSICAL_ATTACK: return "PHYSICAL_ATTACK";
        case ComboResult::FIRE_SPELL: return "FIRE_SPELL";
        case ComboResult::DEFEND_STATE: return "DEFEND_STATE";
        default: return "NONE";
    }
}

int main() {
    SharedStatus status;

    SerialHandler serial("COM9", 115200);
    serial.setCallback([&status](GloveState st) { status.gloveState.store(st); });
    serial.start();

    VoiceHandler voice;
    voice.setCallback([&status](const std::string& word) { status.setVoiceWord(word, std::chrono::seconds(2)); });
    voice.start();

    bool effectActive = false;
    float effectRadius = 0;
    std::string effectColorName = "None";

    std::cout << "Echo-Blade: Aetherbound (Console mode)\n";
    std::cout << "Press Q to quit.\n";

    while (true) {
        GloveState gloveState = status.gloveState.load();
        std::string voiceWord = status.getVoiceWord();
        ComboResult combo = resolveCombo(gloveState, voiceWord);
        status.comboResult.store(combo);

        if (combo == ComboResult::PHYSICAL_ATTACK) {
            effectActive = true;
            effectRadius = 30;
            effectColorName = "ORANGE";
        } else if (combo == ComboResult::FIRE_SPELL) {
            effectActive = true;
            effectRadius = 30;
            effectColorName = "SKYBLUE";
        } else {
            if (!effectActive) {
                effectColorName = "None";
            }
        }

        if (effectActive) {
            effectRadius += 3.5f;
            if (effectRadius > 180) {
                effectActive = false;
                effectColorName = "None";
            }
        }

        #ifdef _WIN32
        if (_kbhit()) {
            char c = _getch();
            if (c == 'q' || c == 'Q') break;
        }
        #endif

        system("cls");
        std::cout << "== Echo-Blade: Aetherbound (Console) ==\n";
        std::cout << "Glove State : " << gloveStateName(gloveState) << "\n";
        std::cout << "Voice Word  : " << voiceWord << "\n";
        std::cout << "Combo       : " << comboName(combo) << "\n";
        std::cout << "Effect      : " << (effectActive ? "Active" : "Inactive") << "\n";
        std::cout << "Effect col. : " << effectColorName << "\n";
        std::cout << "Effect rad. : " << effectRadius << "\n";
        std::cout << "[Q] Quit\n";

        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    serial.stop();
    voice.stop();

    std::cout << "Exiting...\n";
    return 0;
}
