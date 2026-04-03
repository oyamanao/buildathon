const int SENSOR1_PIN = 35; // First flex sensor / analog input
const int SENSOR2_PIN = 34; // Second flex sensor / analog input

// Game state
struct GameState {
  int sensor1;
  int sensor2;
  bool canMove;
  int playerX;
} gameState = {0, 0, false, 0};

void setup() {
  Serial.begin(115200);
  pinMode(SENSOR1_PIN, INPUT);
  pinMode(SENSOR2_PIN, INPUT);
  
  Serial.println("Echo-Blade: Game Started");
  Serial.println("Sensors reading on pins 35 and 34");
  Serial.println("Format: SENSOR1,SENSOR2,ACTION");
}

void loop() {
  // Read both analog sensors (0-4095)
  gameState.sensor1 = analogRead(SENSOR1_PIN);
  gameState.sensor2 = analogRead(SENSOR2_PIN);

  // Encode thresholds as bits: <500 => 1, else 0
  const int b1 = gameState.sensor1 < 500 ? 1 : 0;
  const int b2 = gameState.sensor2 < 500 ? 1 : 0;

  // 2-bit signal: sensor1 sensor2
  String signal = String(b1) + String(b2);  // 00, 01, 10, 11

  // Optional movement state (not required by frontend, but useful for debug)
  gameState.canMove = (b1 == 1 && b2 == 1);
  if (gameState.canMove) {
    gameState.playerX += 5; // Move forward if both bent
  }

  Serial.print(signal);
  Serial.print("   ");
  Serial.print("s1=");
  Serial.print(gameState.sensor1);
  Serial.print(" s2=");
  Serial.print(gameState.sensor2);
  Serial.print("\n");

  delay(100);
}