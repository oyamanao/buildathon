const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    // Catch console logs
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    
    await page.goto('http://localhost:5174/');
    await new Promise(r => setTimeout(r, 1000));
    
    // Login
    await page.type('input[type="text"]', 'doom');
    await page.type('input[type="password"]', 'doom');
    await page.click('button.pixel-btn');
    await new Promise(r => setTimeout(r, 2000));
    
    // Switch to keys mode
    const elements = await page.$$('.pixel-btn');
    for(let el of elements) {
      const text = await page.evaluate(el => el.textContent, el);
      if(text.includes('Keys') || text.includes('Mic')) {
         // Do nothing if it's already there
      }
    }
    await page.click('.game-container'); // Focus game
    
    console.log("Holding right arrow...");
    await page.keyboard.down('ArrowRight');
    await new Promise(r => setTimeout(r, 500)); // Hold for 500ms
    
    // Read the gesture badge
    const gesture = await page.evaluate(() => {
        const value = document.querySelector('.action-value');
        return value ? value.textContent : 'UNKNOWN';
    });
    console.log("Gesture while holding right:", gesture);
    
    await page.keyboard.up('ArrowRight');
    
    // Read the player x position via window state if possible
    
    await browser.close();
})();
