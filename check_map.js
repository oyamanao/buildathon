const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'web_server/client/public/assets/maps/map.json');
const map = JSON.parse(fs.readFileSync(file, 'utf8'));
const d = map.layers[0].data;
const w = map.layers[0].width;
const h = map.layers[0].height;

let newD = [...d];

console.log('Original map:');
for(let r=0; r<h; r++) {
  let s = '';
  for(let c=0; c<w; c++) {
    let t = d[r*w+c];
    if (t > 0 && t < 2000000000) {
      s += '*';
    } else {
      s += ' ';
    }
  }
  console.log(s);
}

// "move the logs inside the map so i can pass"
// We can just wipe out obstacles in the middle rows (like rows 10-18) that are standing in the way
for(let r=12; r<=17; r++) {
  for(let c=10; c<50; c++) {
    if (newD[r*w+c] > 0 && newD[r*w+c] < 2000000000) {
      // It's a solid block. Let's make it empty.
      newD[r*w+c] = 0;
    }
  }
}

map.layers[0].data = newD;
fs.writeFileSync(file, JSON.stringify(map));
console.log('Map updated to clear obstacles in mid-air.');
